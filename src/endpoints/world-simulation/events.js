import express from 'express';
import { readEvents, appendEvent, deleteEvent } from './storage/events.js';

export const router = express.Router();

// GET /:worldId — list events
router.get('/:worldId', async (req, res) => {
    try {
        const data = await readEvents(req.user.directories, req.params.worldId);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId — add confirmed event
router.post('/:worldId', async (req, res) => {
    try {
        const event = req.body;
        if (!event?.id || !event?.title) {
            return res.status(400).json({ error: 'missing_fields', required: ['id', 'title'] });
        }
        await appendEvent(req.user.directories, req.params.worldId, event);
        res.status(201).json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// DELETE /:worldId/:eventId — remove event
router.delete('/:worldId/:eventId', async (req, res) => {
    try {
        await deleteEvent(req.user.directories, req.params.worldId, req.params.eventId);
        res.sendStatus(204);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
