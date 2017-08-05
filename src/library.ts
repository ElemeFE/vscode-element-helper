'use strict';

const fs  = require('fs');
const Path = require('path');
const os = require('os');
import DocSet from './docset';
import Resource from './resource';
import { exec, mkdir, cd, which, exit, rm} from 'shelljs';
import { window, workspace, ExtensionContext } from 'vscode';

class Library {
  static REFRESH_PERIOD_MS_ = 6 * 60 * 60 * 1000;
  static DEFAULT_DOCSETS = new Set([
    'element'
  ]);

  catalog: any;
  repos: any;
  cmd: string;
  context: ExtensionContext;

  constructor(context: ExtensionContext) {
    this.catalog = null;
    this.context = context;
    this.fetchRepo();
    this.cmd = '';
    setInterval(() => { this.fetchAllVersion(this.repos); }, Library.REFRESH_PERIOD_MS_);
  }

  // id: type
  get(id) {
    return this.catalog[id];
  }

  queryAll() {
    let ret = [];
    for (const id in this.catalog) {
      ret = ret.concat(this.catalog[id].queryAll());
    }
    return ret;
  }

  fetchRepo() {
    return Resource.get(Resource.RESOURCE_REPO)
      .then((result: string) => {
        this.repos = JSON.parse(result)
        this.buildCatalog(this.repos);
        this.fetchAllVersion(this.repos);
      }).catch(error => {
        console.log('fetchRepo error: ', error);
      });
  }

  fetchAllVersion(repos) {
    for (let i = 0; i < repos.length; ++i) {
      let repo = repos[i];
      this.fetchVersion(repo);
    }
  }

  setVersionSchema(versions: string[]) {
    const config = workspace.getConfiguration('element-helper');
    const filename = Path.join(__dirname, '..', '..', 'package.json');
    fs.readFile(filename, 'utf8', (err, data) => {
      if (err) console.error('ReadFail');
      const content = JSON.parse(data);
      content.contributes.configuration.properties['element-helper.version']['enum'] = versions;
      config.update('version', versions[versions.length - 1], true);
      fs.writeFileSync(filename, JSON.stringify(content, null, 2));
    });
  }
  
  fetchVersion(repo) {
    if (!which('git')) {
      window.showInformationMessage('Please specify your git.path setting to your git path, or update your git version to 2+, and then specify git.path setting');
      return;
    }
    const path = `${repo.type}/versions.json`;
    Resource.get(path).then((local: string) => {
      Resource.getFromUrl(Resource.ELEMENT_VERSION_URL, Path.join(Resource.RESOURCE_PATH, path))
        .then((online: string) => {
          const oldVersions = this.getValues(JSON.parse(local));
          const newVersions = this.getValues(JSON.parse(online));
          if (newVersions.length > oldVersions.length) {
            cd(`${Path.join(Resource.RESOURCE_PATH,'element-gh-pages')}`);
            const cmd = 'git branch -D temp && git checkout -b temp && git branch -D gh-pages && git fetch origin gh-pages && git checkout --track origin/gh-pages';
            exec(cmd, (code, stdout, stderr) => {
              if (code > 1) {
                fs.unlinkSync(Path.join(Resource.RESOURCE_PATH, path));
                exit(1);
                return;
              }
              this.setVersionSchema(newVersions);
              Resource.updateResource();
              window.showInformationMessage(`${repo.name} version updated to ${newVersions[newVersions.length - 1]}`);
            });
          }
        });
    }).catch(error => {
      Resource.getFromUrl(Resource.ELEMENT_VERSION_URL, Path.join(Resource.RESOURCE_PATH, path))
        .then((online: string) => {
          const versions = this.getValues(JSON.parse(online));
          this.setVersionSchema(versions);
          this.setLoading(true);
          cd(`${Resource.RESOURCE_PATH}`);
          this.initGitRepo();
          exec(this.cmd, (code, stdout, stderr) => {
            if (code) {
              console.log(code);
              this.initGitRepo('https');
              console.log(this.cmd);
              exec(this.cmd, (code, stdout, stderr) => {
                this.setLoading(false);
                if (code) {
                  window.showInformationMessage('Load document failure, please config your git ssh-key or check your network and reload.');
                  fs.unlinkSync(Path.join(Resource.RESOURCE_PATH, path));
                  exit(1);
                  return;
                }
                Resource.updateResource();
              });
            } else {
              this.setLoading(false);
              Resource.updateResource();
            }
          });
        });
    });
  }

  setLoading(value: boolean) {
    this.context.workspaceState.update('element-helper.loading', value);
  }

  initGitRepo(type?: string) {
    rm('-rf', './element-gh-pages');
    mkdir('-p', './element-gh-pages');
    const repo: string = type === 'https' ? 'https://github.com/ElemeFE/element.git' : 'git@github.com:ElemeFE/element.git';
    this.cmd = `cd element-gh-pages && git init && git remote add -t gh-pages -f origin ${repo} && git checkout gh-pages`;
  }

  getValues(obj) {
    let values = [];
    for (let key in obj) {
      values.push(obj[key]);
    }
    return values;
  }

  buildCatalog(repos) {
    const catalog = {};

    for (let i = 0; i < repos.length; ++i) {
      const repo = repos[i];
      catalog[repo.type] = new DocSet(repo);
    }

    this.catalog = catalog;
  }
}

export default Library;
