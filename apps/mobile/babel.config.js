function transformImportMetaUrl({ types }) {
  return {
    name: 'novo-transform-import-meta-url',
    visitor: {
      MemberExpression(path) {
        const { object, property, computed } = path.node;
        const isImportMeta = object.type === 'MetaProperty'
          && object.meta.name === 'import'
          && object.property.name === 'meta';
        const isUrl = (!computed && property.type === 'Identifier' && property.name === 'url')
          || (computed && property.type === 'StringLiteral' && property.value === 'url');

        if (isImportMeta && isUrl) {
          path.replaceWith(types.binaryExpression(
            '+',
            types.memberExpression(
              types.memberExpression(types.identifier('globalThis'), types.identifier('location')),
              types.identifier('origin'),
            ),
            types.stringLiteral('/_expo/static/js/web/maplibre-gl.mjs'),
          ));
        }
      },
    },
  };
}

module.exports = function configureBabel(api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: ['@babel/plugin-transform-class-static-block', transformImportMetaUrl],
  };
};
