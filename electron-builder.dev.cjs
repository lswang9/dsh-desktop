const packageJson = require('./package.json')

module.exports = {
  ...packageJson.build,
  appId: 'app.pierhouse.desktop.dev',
  productName: 'Pierhouse Dev',
  directories: {
    ...packageJson.build.directories,
    output: 'dist-dev'
  },
  extraMetadata: {
    name: 'pierhouse-dev',
    productName: 'Pierhouse Dev',
    dshDesktopChannel: 'development'
  },
  artifactName: 'pierhouse-dev-${os}-${arch}.${ext}',
  nsis: {
    ...packageJson.build.nsis,
    artifactName: 'pierhouse-dev-windows-${arch}-setup.${ext}'
  },
  publish: null
}
