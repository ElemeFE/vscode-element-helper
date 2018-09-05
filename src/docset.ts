'use babel';

const Path = require('path');
import Resource from './resource';
import {workspace} from 'vscode';

class DocSet {
  private id_: string;
  private indexPath: string;
  private index_: any;
  private language_: string;

  constructor(item) {
    this.id_ = item.type;
    this.indexPath = this.id_ + '/index.json';
    this.index_ = null;
    this.language_ = workspace.getConfiguration('element-helper').get('language');
    this.getMemu();
  }

  getMemu() {
    Resource.get(Path.join(Resource.RESOURCE_PATH, this.indexPath))
    .then((result: string) => {
      this.index_ = JSON.parse(result);

      for (var i = 0 ; i < this.index_.entries.length; ++i) {
        this.index_.entries[i].id = this.id_;
      }
    });
  }

  getTitle(path) {
    for (let i = 0; i < this.index_.entries.length; ++i) {
      if (this.index_.entries[i].path == path) {
        return this.language_ === 'zh-CN' ? this.index_.entries[i].name : this.index_.entries[i].name.split(' ').shift();
      }
    }
    return '';
  }

  queryAll() {
    return !this.index_ ? [] : this.index_.entries;
  }
}

export default DocSet;
