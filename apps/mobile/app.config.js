const baseConfig = require('./app.json').expo;
const PRODUCTION_API_URL = 'https://novo.tancheetiong.com/api';

const buildEnvironment = (process.env.NOVO_BUILD_ENV || 'development').toLowerCase();
if (!['development', 'production'].includes(buildEnvironment)) {
  throw new Error(`Unknown novo build environment "${buildEnvironment}". Use development or production.`);
}

const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const apiUrl = explicitApiUrl || (buildEnvironment === 'production' ? PRODUCTION_API_URL : undefined);
if (apiUrl && !/^https?:\/\/[^/]+(?:\/.*)?$/i.test(apiUrl)) {
  throw new Error(`Invalid novo API URL: "${apiUrl}".`);
}
if (buildEnvironment === 'production' && !apiUrl?.startsWith('https://')) {
  throw new Error('Production builds require an HTTPS API URL.');
}

module.exports = {
  ...baseConfig,
  extra: {
    ...(baseConfig.extra || {}),
    ...(apiUrl ? { apiUrl } : {}),
    buildEnvironment,
  },
};
