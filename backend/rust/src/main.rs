use std::{
    env,
    fs::{self, File, OpenOptions},
    io::Write,
    os::{fd::AsRawFd, unix::fs::OpenOptionsExt},
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc,
    },
    pin::Pin,
    time::Instant,
};

use futures_util::{SinkExt, StreamExt, Stream};
use parking_lot::Mutex as ParkingMutex;
use rand::Rng;
use tempfile::NamedTempFile;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    time::{interval, Duration},
};
use tokio_tungstenite::{
    accept_async,
    tungstenite::Message,
};
use tracing::{error, info};

const SHMEM_SIZE: usize = 4 * 32 * 64 + 4;
const MATRIX_BUFFER_SIZE: usize = 64 * 32 * 4;
const TARGET_FPS: u64 = 240;

struct SharedPtr<T: ?Sized> {
    ptr: *mut T,
}

unsafe impl<T: ?Sized> Send for SharedPtr<T> {}
unsafe impl<T: ?Sized> Sync for SharedPtr<T> {}

struct SharedMemory {
    lock: Arc<ParkingMutex<SharedPtr<AtomicU32>>>,
    matrix: Arc<ParkingMutex<SharedPtr<[u8]>>>,
    file: File,
}

impl SharedMemory {
    fn new(name: &str) -> std::io::Result<Self> {
        let path = PathBuf::from("/dev/shm/neon").join(name);
        
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .mode(0o666)
            .open(&path)?;
            
        file.set_len(SHMEM_SIZE as u64)?;

        if let Ok(metadata) = file.metadata() {
            info!("Created file {:?} with permissions: {:?}", &path, metadata.permissions());
        }

        let mmap = unsafe {
            libc::mmap(
                std::ptr::null_mut(),
                SHMEM_SIZE,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_SHARED,
                file.as_raw_fd(),
                0,
            )
        };

        if mmap == libc::MAP_FAILED {
            let err = std::io::Error::last_os_error();
            error!("mmap failed: {}", err);
            return Err(err);
        }

        Ok(Self {
            lock: Arc::new(ParkingMutex::new(SharedPtr { ptr: mmap as *mut AtomicU32 })),
            matrix: Arc::new(ParkingMutex::new(SharedPtr { 
                ptr: unsafe { std::slice::from_raw_parts_mut((mmap as *mut u8).add(4), SHMEM_SIZE - 4) }
            })),
            file,
        })
    }

    fn unlink(&self) -> std::io::Result<()> {
        fs::remove_file(PathBuf::from("/dev/shm/neon").join(format!("neon.{}", rand::thread_rng().gen::<u32>())))
    }
}

impl Drop for SharedMemory {
    fn drop(&mut self) {
        unsafe {
            libc::munmap(self.lock.lock().ptr as *mut libc::c_void, SHMEM_SIZE);
        }
    }
}

async fn handle_matrix_updates(
    shmem: Arc<SharedMemory>,
    tx: mpsc::Sender<Vec<u8>>,
) {
    let mut interval = interval(Duration::from_micros(1_000_000 / TARGET_FPS));
    let mut matrix = vec![0u8; MATRIX_BUFFER_SIZE];
    let mut last_update = Instant::now();
    let mut frame_count = 0;
    let mut last_fps_check = Instant::now();

    loop {
        interval.tick().await;
        
        {
            let lock_guard = shmem.lock.lock();
            if unsafe { (*lock_guard.ptr).compare_exchange_weak(0, 1, Ordering::Relaxed, Ordering::Relaxed) }.is_ok() {
                let matrix_ptr = shmem.matrix.lock();
                unsafe {
                    matrix.copy_from_slice(&*matrix_ptr.ptr);
                }
                unsafe { (*lock_guard.ptr).store(0, Ordering::Relaxed) };
                
                let now = Instant::now();
                if now.duration_since(last_update).as_micros() >= 4_166 {
                    if tx.try_send(matrix.clone()).is_ok() {
                        last_update = now;
                        frame_count += 1;
                    }
                }
            }
        }

        if last_fps_check.elapsed().as_secs() >= 1 {
            frame_count = 0;
            last_fps_check = Instant::now();
        }
    }
}

async fn handle_connection(stream: TcpStream, _filenames: Vec<String>) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("WebSocket handshake failed: {}", e);
            return;
        }
    };

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    let shmem_name = format!("neon.{}", rand::thread_rng().gen::<u32>());
    
    let path = PathBuf::from("/dev/shm/neon");
    if let Ok(metadata) = fs::metadata(&path) {
        info!("Directory {:?} exists, permissions: {:?}", &path, metadata.permissions());
    } else {
        error!("Directory {:?} does not exist or cannot be accessed.", &path);
    }
    
    let shmem = match SharedMemory::new(&shmem_name) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            error!("Failed to create shared memory: {}", e);
            return;
        }
    };

    let (matrix_tx, mut matrix_rx) = mpsc::channel(TARGET_FPS as usize * 2);

    let shmem_clone = Arc::clone(&shmem);
    tokio::spawn(handle_matrix_updates(shmem_clone, matrix_tx));

    let code = match ws_rx.next().await {
        Some(Ok(Message::Binary(code))) => {
            info!("Received initial code via WebSocket (binary): {}", String::from_utf8_lossy(&code));
            String::from_utf8_lossy(&code).to_string()
        }
        Some(Ok(Message::Text(code))) => {
            info!("Received initial code via WebSocket (text): {}", code);
            code
        }
        other => {
            error!("Expected code message, got: {:?}", other);
            return;
        }
    };

    if let Err(e) = create_container(&shmem_name, &code) {
        error!("Failed to create container: {}", e);
        return;
    }

    let (mut child, stdout) = match spawn_process(&shmem_name).await {
        Ok((c, o)) => (c, o),
        Err(e) => {
            error!("Failed to spawn process: {}", e);
            return;
        }
    };

    let stderr = child.stderr.take();
    if let Some(stderr) = stderr {
        let stderr_reader = BufReader::new(stderr).lines();
        tokio::spawn(async move {
            let mut lines = stderr_reader;
            while let Ok(Some(line)) = lines.next_line().await {
                error!("Python stderr: {}", line);
            }
        });
    }

    let mut stdout = stdout;
    let mut last_matrix_send = Instant::now();

    loop {
        tokio::select! {
            biased;

            Some(matrix) = matrix_rx.recv() => {
                let now = Instant::now();
                if now.duration_since(last_matrix_send).as_micros() >= 4_166 {
                    if ws_tx.send(Message::Binary(matrix)).await.is_err() {
                        break;
                    }
                    last_matrix_send = now;
                }
            }
            Some(line) = stdout.next() => {
                match line {
                    Ok(line) => {
                        if ws_tx.send(Message::Text(line)).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Failed to read stdout: {}", e);
                        break;
                    }
                }
            }
            Some(msg) = ws_rx.next() => {
                match msg {
                    Ok(Message::Binary(input)) => {
                        if let Some(stdin) = child.stdin.as_mut() {
                            if let Err(e) = stdin.write_all(&input).await {
                                error!("Failed to write to stdin: {}", e);
                                break;
                            }
                        }
                    }
                    Ok(Message::Text(input)) => {
                        if let Some(stdin) = child.stdin.as_mut() {
                            if let Err(e) = stdin.write_all(input.as_bytes()).await {
                                error!("Failed to write to stdin: {}", e);
                                break;
                            }
                        }
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }
            else => break,
        }
    }

    let _ = child.kill().await;
    let _ = Command::new("docker").args(["kill", &shmem_name]).status();
    let _ = shmem.unlink();
}

fn create_container(name: &str, code: &str) -> std::io::Result<()> {
    let output = Command::new("docker")
        .args([
            "create",
            "--name",
            name,
            "--mount",
            &format!("type=bind,src=/dev/shm/neon/{},dst=/dev/shm/neon", name),
            "neon",
            "-u",
            "-c",
            &format!("import neon_wrappers; {}", code),
        ])
        .output()?;

    if !output.status.success() {
        error!("Docker create failed: {}", String::from_utf8_lossy(&output.stderr));
        return Err(std::io::Error::new(std::io::ErrorKind::Other, "Docker create failed"));
    }
    info!("Docker create output: {}", String::from_utf8_lossy(&output.stdout));
    Ok(())
}

fn load_file(filename: &str, content: &[u8], container: &str) -> std::io::Result<()> {
    let mut temp = NamedTempFile::new()?;
    temp.write_all(content)?;
    
    Command::new("docker")
        .args([
            "cp",
            temp.path().to_str().unwrap(),
            &format!("{}:/root/{}", container, filename),
        ])
        .status()?;
    Ok(())
}

async fn spawn_process(name: &str) -> std::io::Result<(tokio::process::Child, Pin<Box<dyn Stream<Item = std::io::Result<String>> + Send>>)> {
    let mut child = tokio::process::Command::new("docker")
        .args(["start", "-ai", name])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::piped())
        .spawn()?;

    let stdout = BufReader::new(child.stdout.take().unwrap()).lines();
    
    let stream = futures_util::stream::unfold(stdout, |mut lines| async move {
        match lines.next_line().await {
            Ok(Some(line)) => Some((Ok(line), lines)),
            Ok(None) => None,
            Err(e) => Some((Err(e), lines)),
        }
    });

    Ok((child, Box::pin(stream)))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    if let Err(e) = Command::new("docker")
        .args(["build", "./runner", "--tag=neon"])
        .status()
    {
        error!("Failed to build runner image: {}", e);
        return;
    }

    let addr = "0.0.0.0:8080";
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    info!("Listening on {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        let filenames: Vec<String> = env::args().skip(1).collect();
        tokio::spawn(handle_connection(stream, filenames));
    }
} 