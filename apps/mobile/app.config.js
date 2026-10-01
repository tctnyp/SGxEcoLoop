const PRODUCTION_API_URL = 'https://novo.tancheetiong.com/api';
const BETA_API_URL = 'https://novodev.tancheetiong.com/api';
const EAS_PROJECT_ID = '428f6517-bea5-40fc-ae1f-549e9b3a5742';

const buildEnvironment = (process.env.NOVO_BUILD_ENV || 'development').toLowerCase();
if (!['development', 'beta', 'production'].includes(buildEnvironment)) {
  throw new Error(`Unknown novo build environment "${buildEnvironment}". Use development, beta or production.`);
}

const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const apiUrl = explicitApiUrl || (buildEnvironment === 'production' ? PRODUCTION_API_URL : buildEnvironment === 'beta' ? BETA_API_URL : undefined);
if (apiUrl && !/^https?:\/\/[^/]+(?:\/.*)?$/i.test(apiUrl)) {
  throw new Error(`Invalid novo API URL: "${apiUrl}".`);
}
if (['beta', 'production'].includes(buildEnvironment) && !apiUrl?.startsWith('https://')) {
  throw new Error(`${buildEnvironment} builds require an HTTPS API URL.`);
}

const appName = buildEnvironment === 'development' ? 'novo Development' : buildEnvironment === 'beta' ? 'novo Beta' : 'novo';

module.exports = ({ config }) => ({
  ...config,
  name: appName,
  owner: 'zaviergpt',
  extra: {
    ...(config.extra || {}),
    ...(apiUrl ? { apiUrl } : {}),
    buildEnvironment,
    eas: {
      ...(config.extra?.eas || {}),
      projectId: EAS_PROJECT_ID,
    },
  },
});
