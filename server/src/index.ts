import express from 'express';
import cors from 'cors';
import { env } from './env.ts';
import { requireAuth } from './auth/middleware.ts';
import { requireModule } from './auth/perms.ts';
import { authRouter } from './routes/auth.ts';
import { contactsRouter } from './routes/contacts.ts';
import { pipelinesRouter } from './routes/pipelines.ts';
import { stagesRouter } from './routes/stages.ts';
import { opportunitiesRouter } from './routes/opportunities.ts';
import { tasksRouter } from './routes/tasks.ts';
import { usersRouter } from './routes/users.ts';
import { meRouter } from './routes/me.ts';
import { organizationRouter } from './routes/organization.ts';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
// Todo lo de abajo exige token válido.
app.use('/api/contacts', requireAuth, requireModule('contacts'), contactsRouter);
app.use('/api/pipelines', requireAuth, requireModule('opportunities'), pipelinesRouter);
app.use('/api/stages', requireAuth, requireModule('opportunities'), stagesRouter);
app.use('/api/opportunities', requireAuth, requireModule('opportunities'), opportunitiesRouter);
app.use('/api/tasks', requireAuth, requireModule('tasks'), tasksRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/me', requireAuth, meRouter);
app.use('/api/organization', requireAuth, organizationRouter);

// Manejador de errores central: cualquier throw async cae aquí sin tumbar el server.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(env.port, () => console.log(`API en http://localhost:${env.port}`));
