'use strict';

const fs  = require('fs');
const Path = require('path');
import DocSet from './docset';
import Resource from './resource';
import { exec } from 'child_process';
import { window, workspace, ExtensionContext } from 'vscode';

class Library {
  static REFRESH_PERIOD_MS_ = 6 * 60 * 60 * 1000;
  static DEFAULT_DOCSETS = new Set([
    'element'
  ]);

  catalog: any;
  repos: any;
  context: ExtensionContext;

  constructor(context: ExtensionContext) {
    this.catalog = null;
    this.context = context;
    this.fetchRepo();
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
    Resource.get(`${repo.type}/versions.json`).then((local: string) => {
      Resource.getFromUrl(Resource.ELEMENT_VERSION_URL, Path.join(Resource.RESOURCE_PATH, `${repo.type}/versions.json`))
        .then((online: string) => {
          const oldVersions = this.getValues(JSON.parse(local));
          const newVersions = this.getValues(JSON.parse(online));
          this.context.globalState.update('element-helper.loading', true);
          if (newVersions.length > oldVersions.length) {
            exec(`cd ${Resource.RESOURCE_PATH} && sh ./update.sh`, (err, stdout) => {
              this.context.globalState.update('element-helper.loading', undefined);
              if (err) return;
              this.setVersionSchema(newVersions);
              Resource.updateResource();
              window.showInformationMessage(`a new ${repo.name} version updated, you can select it on package setting`);
            });
          }
        });
    }).catch(error => {
      Resource.getFromUrl(Resource.ELEMENT_VERSION_URL, Path.join(Resource.RESOURCE_PATH, `${repo.type}/versions.json`))
        .then((online: string) => {
          const versions = this.getValues(JSON.parse(online));
          this.setVersionSchema(versions);
          this.context.globalState.update('element-helper.loading', true);
          exec(`cd ${Resource.RESOURCE_PATH} && sh ./update.sh first`, (err, stdout) => {
            this.context.globalState.update('element-helper.loading', undefined);
            if (err) {
              window.showInformationMessage('Load document failure, please check your network.');
              return;
            }
            Resource.updateResource();
          });
        });
    });
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
