const logger = require('./core__logger');
const { routeTask } = require('./core__aiRouter');

async function runTask(task, context) {
  const taskId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  logger.info('task_started', { taskId, userId: context.userId, guildId: context.guildId, length: task.length });
  try {
    const result = await routeTask(task, context);
    logger.info('task_completed', { taskId, agent: result.agent, userId: context.userId, guildId: context.guildId });
    return { taskId, ...result };
  } catch (error) {
    logger.error('task_failed', { taskId, userId: context.userId, guildId: context.guildId, error });
    throw error;
  }
}
module.exports = { runTask };
