import React from "react";
import styles from "./css/app.module.scss";

/**
 * Phase 0 scaffold — Hello Weave. Feature ports land in later Creator phases.
 */
export default function App(): React.ReactElement {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Hello Weave</h1>
      <p className={styles.sub}>
        Creator Phase 0 scaffold. Playlist editing returns in later migration
        phases.
      </p>
    </div>
  );
}
