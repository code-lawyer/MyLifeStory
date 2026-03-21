import express from 'express';
import { router as eventsRouter } from './events.js';
import { router as contextRouter } from './context.js';
import { router as stateRouter } from './state.js';
import { router as playerRouter } from './player.js';
import { router as scenesRouter } from './scenes.js';
import { router as generateRouter } from './generate.js';
import { router as worldsRouter } from './worlds.js';

export const router = express.Router();

router.get('/health', (_req, res) => res.json({ ok: true }));

router.use('/events', eventsRouter);
router.use('/context', contextRouter);
router.use('/state', stateRouter);
router.use('/player', playerRouter);
router.use('/scenes', scenesRouter);
router.use('/generate', generateRouter);
router.use('/worlds', worldsRouter);
