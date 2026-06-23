import './style.css';
import { initApp } from './ui/app';
import { injectSpeedInsights } from '@vercel/speed-insights';
// Initialize Vercel Speed Insights
injectSpeedInsights();
initApp();
