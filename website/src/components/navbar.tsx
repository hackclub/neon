import styles from "./navbar.module.css";
import logo from "../assets/logo.png";

export default function Navbar() {
    return <div className={styles.navbar}>
        <img src={logo.src} className={styles.logo}
             width={50} height={50}/>
        <h1 className={styles.title}>Neon</h1>
    </div>
}