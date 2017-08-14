'use strict';

import { http as Http } from "follow-redirects";
import { mkdir } from 'shelljs';
const fs  = require('fs');
const Path = require('path');
const cheerio = require("cheerio");

export default class Resource {
  // resources local path
  static RESOURCE_PATH: string = Path.join(__dirname, '..', '..', 'resources');
  static ELEMENT_PATH: string = Path.join(__dirname, '..', '..', 'node_modules', 'element-gh-pages');
  static URL_REG: RegExp = /((?:src|href)\s*=\s*)(['"])(\/\/[^'"]*)\2/g;
  static ELEMENT_VERSION_URL: string = 'http://element.eleme.io/versions.json';
  static ELEMENT_HOME_URL: string = 'http://element.eleme.io/';
  static RESOURCE_REPO: string = 'repos.json';

  static get(filePath: string) {

    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) reject('ReadFail');

        resolve(data);
      });
    });
  }

  static getFromUrl(url: string, filename?: string) {
    return new Promise((resolve, reject) => {
      Http.get(url, response => {
        response.on('error', reject);
        let buffer = '';
        response.on('data', chunk => { buffer += chunk; });
        response.on('end', () => { resolve(buffer); });
      }).on('error', reject);
    }).then(result => {
      if (filename) {
        mkdir('-p', Path.dirname(filename));
        fs.writeFileSync(filename, result);
      }
      return result;
    }).catch(error => console.log(error));
  }

  static fixResource(file: string): void {
    const htmlPath = Path.join(Resource.ELEMENT_PATH, file);
    Resource.get(htmlPath)
      .then((content:string) => {
        const matched = [];
        content = content.replace(Resource.URL_REG, (match, one, two, three)=> {
          const name = Path.basename(three);
          Resource.getFromUrl(`http:${three}`, Path.join(Path.dirname(htmlPath), name));
          return `${one}${two}${name}${two}`;
        });

        let $ = cheerio.load(content);

        const jqScript = $(`<script type="text/javascript" src="${Path.join(Resource.RESOURCE_PATH, '../node_modules/jquery/dist/jquery.min.js')}"></script>`);
        const fixScript = $(`<script type="text/javascript" src="${Path.join(Resource.RESOURCE_PATH, 'element', 'fix.js')}"></script>`);
        const style = $(`<link href="${Path.join(Resource.RESOURCE_PATH, 'element', 'style.css')}" rel="stylesheet">`);
        $('body').append(jqScript).append(fixScript);
        $('head').append(style);

        const indexPath = Path.join(Resource.ELEMENT_PATH, file);
        const dir = Path.dirname(indexPath);
        fs.writeFileSync(Path.join(dir, 'main.html'), $.html());
        return content;
      });
  }

  static updateResource() {
    fs.readdir(Resource.ELEMENT_PATH, (err, files) => {
      if (err) {
        return;
      }

      for(let i = 0; i < files.length; ++i) {
        const status = fs.lstatSync(Path.join(Resource.ELEMENT_PATH, files[i]));
        if (status.isFile() && /index.html$/.test(files[i])) { // index.html entry
          Resource.fixResource(files[i]);
        } else if (status.isDirectory() && /^\d+\./.test(files[i])) { // version directory
          Resource.fixResource(Path.join(files[i], 'index.html'));
        } else {
          continue;
        }
      }
    });
  }
}
