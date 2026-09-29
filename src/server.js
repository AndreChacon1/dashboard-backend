import { createApp } from './app.js';
const port = process.env.PORT || 3001;
createApp().listen(port, () => console.info(`API en http://localhost:${port}`));
