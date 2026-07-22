import express from 'express';
import cors from 'cors';
import { env } from './env.ts';
import { requireAuth } from './auth/middleware.ts';
import { authRouter } from './routes/auth.ts';
import { contactsRouter } from './routes/contacts.ts';
import { pipelinesRouter } from './routes/pipelines.ts';
import { stagesRouter } from './routes/stages.ts';
import { opportunitiesRouter } from './routes/opportunities.ts';
import { usersRouter } from './routes/users.ts';
import { meRouter } from './routes/me.ts';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
// Todo lo de abajo exige token válido.
app.use('/api/contacts', requireAuth, contactsRouter);
app.use('/api/pipelines', requireAuth, pipelinesRouter);
app.use('/api/stages', requireAuth, stagesRouter);
app.use('/api/opportunities', requireAuth, opportunitiesRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/me', requireAuth, meRouter);

// Manejador de errores central: cualquier throw async cae aquí sin tumbar el server.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(env.port, () => console.log(`API en http://localhost:${env.port}`));
