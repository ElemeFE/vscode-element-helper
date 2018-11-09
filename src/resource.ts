'use strict';

import { mkdir } from 'shelljs';
const fs  = require('fs');
const Path = require('path');
const cheerio = require("cheerio");
const http = require('http');
const https = require('https');

export default class Resource {
  // resources local path
  static RESOURCE_PATH: string = Path.join(__dirname, '..', '..', 'resources');
  static ELEMENT_PATH: string = Path.join(__dirname, '..', '..', 'node_modules', 'element-gh-pages');
  static URL_REG: RegExp = /((?:src|href)\s*=\s*)(['"])(\/\/[^'"]*)\2/g;
  static ELEMENT_VERSION_URL: string = 'https://element.eleme.io/versions.json';
  static ELEMENT_HOME_URL: string = 'https://element.eleme.io/';
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
      const req = /^https:\/\//.test(url) ? https : http;
      req.get(url, (res) => {
        const { statusCode } = res;
        let error;
        if (statusCode !== 200) {
          error = new Error(`Request failure, status code: ${statusCode}`);
        }
        if (error) {
          res.resume();
          return reject(error.message);
        }
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => resolve(rawData));
      }).on('error', (e) => {
        reject(`error: ${e.message}`);
      });
    }).then(result => {
      if (filename) {
        mkdir('-p', Path.dirname(filename));
        fs.writeFileSync(filename, result);
      }
      return result;
    }).catch(error => Promise.reject(error));
  }

  static fixResource(file: string, vs: any): void {
    const htmlPath = Path.join(Resource.ELEMENT_PATH, file);
    Resource.get(htmlPath)
      .then((content:string) => {
        const matched = [];
        content = content.replace(Resource.URL_REG, (match, one, two, three)=> {
          const name = Path.basename(three);
          const url = `https:${three}`;
          const url2 = `http:${three}`;
          Resource.getFromUrl(url, Path.join(Path.dirname(htmlPath), name)).catch(error =>{
            // one more again
            Resource.getFromUrl(url2, Path.join(Path.dirname(htmlPath), name));
          });
          return `${one}${two}${name}${two}`;
        });

        let $ = cheerio.load(content);

        const jqScript = $(`<script type="text/javascript" src="${Path.join(Resource.RESOURCE_PATH, '../node_modules/jquery/dist/jquery.min.js')}"></script>`);
        const fixScript = $(`<script type="text/javascript" src="${Path.join(Resource.RESOURCE_PATH, 'element', `fix${vs}.js`)}"></script>`);
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
          Resource.fixResource(files[i], 2);
        } else if (status.isDirectory() && /^\d+\./.test(files[i])) { // version directory
          Resource.fixResource(Path.join(files[i], 'index.html'), files[i].split('.')[0] || 1);
        } else {
          continue;
        }
      }
    });
  }
}
