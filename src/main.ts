import './styles.css';
import { startApp } from './app.js';

if (import.meta.env.DEV && new URLSearchParams(location.search).has('dev')) {
  void import('./dev.js').then(({ startDev }) => startDev());
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has('botsim')) {
  void import('./botsim.js').then(({ startBotSim }) => startBotSim());
} else {
  void startApp();
}
