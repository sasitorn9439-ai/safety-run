import './styles.css';
import { startApp } from './app.js';

if (import.meta.env.DEV && new URLSearchParams(location.search).has('dev')) {
  void import('./dev.js').then(({ startDev }) => startDev());
} else {
  void startApp();
}
