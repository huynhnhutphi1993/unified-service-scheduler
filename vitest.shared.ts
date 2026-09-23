import swc from 'unplugin-swc';

export const testPlugins = () => [
  swc.vite({
    module: { type: 'es6' },
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  }),
];
