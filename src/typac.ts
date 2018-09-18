import * as fs from 'fs';
import * as path from 'path';
import * as programm from 'commander';
import { spawnSync } from 'child_process';
import * as npmFetch from 'npm-registry-fetch'
import * as npm from '@npm/types'

const pckg = require('../package.json');

interface ITypacProgramm {
  args: string[];
  dev: boolean;
  save: boolean;
}

const useYarn = fs.existsSync(path.join(process.cwd(), 'yarn.lock'));

programm
  .version(pckg.version)
  .usage('[options] package_name [package_name_1 ...]')
  .option('-D, --dev') // alias
  .option('-S, --save') // alias
  .option('-d, --dev', 'save all to devDependencies')
  .option('-s, --save', 'save all to dependencies')
  .parse(process.argv);

const prog = (programm as any) as ITypacProgramm;

const packages = prog.args;
const { dev, save } = prog;

if (dev && save) {
  console.log('--dev and --save flags are mutually exclusive, only one allowed');
  process.exit(1);
}

main().catch((err) => {
  throw err;
});
async function main() {
  let manager;
  let args; // arguments for package install
  let argsTyped; // arguments fro ypings install

  if (useYarn) {
    manager = 'yarnpkg';
    args = [
      'add',
    ];
    if (dev) {
      args.push('-D');
    }
    argsTyped = ['add'];
    if (!save) {
      argsTyped.push('-D');
    }
  } else {
    manager = 'npm';
    args = [
      'install',
      dev ? '--save-dev' : '--save'
    ];
    argsTyped = [
      'install',
      save ? '--save' : '--save-dev'
    ];
  }

  args.push(...packages);

  const typedPackages = (await Promise.all(packages
  .map((p) => p.startsWith('@') ? p.slice(1).replace('/', '__') : p)
  .map((p) => '@types/' + p)
  .map((p) => {
    return npmFetch.json<npm.Manifest>(p.replace(/\//g, '%2F'))
    .then((json) => {
      const latestVersion = json['dist-tags'].latest;
      if (json.versions[latestVersion].deprecated) {
        return false;
      }
      return json.name;
    })
    .catch((err) => {
      if (err.statusCode !== 404) {
        throw err;
      }
      return false;
    })
  })))
  .filter((p) => p)

  argsTyped.push(...typedPackages);

  const command = manager + ' ' + args.join(' ');
  const commandTyped = manager + ' ' + argsTyped.join(' ');

  console.log('installing', packages.length, `package${packages.length > 1 ? 's' : ''} with`, useYarn ? 'yarn' : 'npm');

  const spawnParams = {
    stdio: 'inherit',
    cwd: process.cwd()
  };

  console.log('running', command);
  spawnSync(manager, args, spawnParams);
  if (typedPackages.length > 0) {
    console.log('running', commandTyped);
    spawnSync(manager, argsTyped, spawnParams);
  } else {
    console.log('no @types module found for requested packages')
  }
}