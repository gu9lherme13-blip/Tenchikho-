const safe = (value) => {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
};
function log(level, event, details = {}) {
  const record = { time: new Date().toISOString(), level, event, ...details };
  const line = JSON.stringify(Object.fromEntries(Object.entries(record).map(([k, v]) => [k, safe(v)])));
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}
module.exports = {
  info: (event, details) => log('info', event, details),
  warn: (event, details) => log('warn', event, details),
  error: (event, details) => log('error', event, details)
};
