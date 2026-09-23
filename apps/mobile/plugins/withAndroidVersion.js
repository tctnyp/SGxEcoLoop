const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidVersion(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    const versionCode = config.android?.versionCode;
    if (Number.isInteger(versionCode)) {
      gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
        /versionCode\s+\d+/,
        `versionCode ${versionCode}`,
      );
    }
    return gradleConfig;
  });
};
