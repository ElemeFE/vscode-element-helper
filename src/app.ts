import {
    window, commands, ViewColumn, Disposable,
    Event, Uri, CancellationToken, TextDocumentContentProvider,
    EventEmitter, workspace, CompletionItemProvider, ProviderResult,
    TextDocument, Position, CompletionItem, CompletionList, CompletionItemKind,
    SnippetString, Range
} from 'vscode';
import Resource from './resource';
import * as TAGS from 'element-helper-json/element-tags.json';
import * as ATTRS from 'element-helper-json/element-attributes.json';

const prettyHTML = require('pretty');
const Path = require('path');
const fs = require('fs');

export const SCHEME = 'element-helper';

export interface Query {
    keyword: string
};

export interface TagObject{
  text: string,
  offset: number
};

export function encodeDocsUri(query?: Query): Uri {
    return Uri.parse(`${SCHEME}://search?${JSON.stringify(query)}`);
}

export function decodeDocsUri(uri: Uri): Query {
    return <Query>JSON.parse(uri.query);
}

export class App {
  private _disposable: Disposable;
  public WORD_REG: RegExp = /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/gi;


  getSeletedText() {
    let editor = window.activeTextEditor;

    if (!editor) {return;}

    let selection = editor.selection;

    if (selection.isEmpty) {
      let text = [];
      let range = editor.document.getWordRangeAtPosition(selection.start, this.WORD_REG);

      return editor.document.getText(range);
    } else {
      return editor.document.getText(selection);
    }
  }

  setConfig() {
    // https://github.com/Microsoft/vscode/issues/24464
    const config = workspace.getConfiguration('editor');
    const quickSuggestions = config.get('quickSuggestions');
    if(!quickSuggestions["strings"]) {
      config.update("quickSuggestions", { "strings": true }, true);
    }
  }

  openHtml(uri: Uri, title) {
    return commands.executeCommand('vscode.previewHtml', uri, ViewColumn.Two, title)
      .then((success) => {
      }, (reason) => {
          window.showErrorMessage(reason);
      });
  }

  openDocs(query?: Query, title = 'Element-helper', editor = window.activeTextEditor){
    this.openHtml(encodeDocsUri(query), title)
  }
        
  dispose() {
    this._disposable.dispose();
  }
}

const HTML_CONTENT = (query: Query) => {
  const filename = Path.join(__dirname, '..', '..', 'package.json');
  const data = fs.readFileSync(filename, 'utf8');
  const content = JSON.parse(data);
  const versions = content.contributes.configuration.properties['element-helper.version']['enum'];
  const lastVersion  = versions[versions.length - 1];
  const config = workspace.getConfiguration('element-helper');
  const language = <string>config.get('language');
  const version = config.get('version');

  let versionText = `${version}/`;
  if (version === lastVersion) {
    versionText = '';
  }

  let opts = ['<select class="docs-version">'];
  let selected = '';
  versions.forEach(item => {
    selected = item === version ? 'selected="selected"' : '';
    opts.push(`<option ${selected} value ="${item}">${item}</option>`);
  });
  opts.push('</select>');
  const html = opts.join('');

  const path = query.keyword;
  const style = fs.readFileSync(Path.join(Resource.RESOURCE_PATH, 'style.css'), 'utf-8');
  
  const componentPath = `${versionText}main.html#/${language}/component/${path}`;
  const href = Resource.ELEMENT_HOME_URL + componentPath.replace('main.html', 'index.html');
  const iframeSrc = 'file://' + Path.join(Resource.ELEMENT_PATH, componentPath).split(Path.sep).join('/');

  const notice = ({
    'zh-CN': `版本：${html}，在线示例请在浏览器中<a href="${href}">查看</a>`,
    'en-US': `Version: ${html}, view online examples in <a href="${href}">browser</a>`
  })[language];

  return `
    <style type="text/css">${style}</style>
    <body class="element-helper-docs-container">
    <div class="element-helper-move-mask"></div>
    <div class="element-helper-loading-mask">
      <div class="element-helper-loading-spinner">
        <svg viewBox="25 25 50 50" class="circular">
          <circle cx="50" cy="50" r="20" fill="none" class="path"></circle>
        </svg>
      </div>
    </div>
    <div class="docs-notice">${notice}</div>
    <iframe id="docs-frame" src="${iframeSrc}"></iframe>
    <script>
      var defaultVersion = '${version}';
      var iframe = document.querySelector('#docs-frame');
      var link = document.querySelector('.docs-notice a');
      window.addEventListener('message', (e) => {
        e.data.loaded && (document.querySelector('.element-helper-loading-mask').style.display = 'none');
        if(e.data.hash) {
          var pathArr = link.href.split('#');
          pathArr.pop();
          pathArr.push(e.data.hash);
          link.href = pathArr.join('#');
          var srcArr = iframe.src.split('#');
          srcArr.pop();
          srcArr.push(e.data.hash);
          iframe.src = srcArr.join('#');
        }
      }, false);
      document.querySelector('.docs-version').addEventListener('change', function() {
        var version = this.options[this.selectedIndex].value;
        var originalSrc = iframe.src;
        var arr = originalSrc.split(new RegExp('/?[0-9.]*/main.html'));
        if(defaultVersion === version) {
          iframe.src = arr.join('/main.html');
          link.href = link.href.replace(new RegExp('/?[0-9.]*/index.html'), '/index.html');
        } else {
          iframe.src = arr.join('/' + version + '/main.html');
          link.href = link.href.replace(new RegExp('/?[0-9.]*/index.html'), '/' + version + '/index.html');
        }
      }, false);
    </script>
    </body>`;
};

export class ElementDocsContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();

    get onDidChange(): Event<Uri> {
      return this._onDidChange.event;
    }

    public update(uri: Uri) {
      this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
      return HTML_CONTENT(decodeDocsUri(uri));
    }
}

export class ElementCompletionItemProvider implements CompletionItemProvider {
  private _document: TextDocument;
  private _position: Position;
  private tagReg: RegExp = /<([\w-]+)\s+/g;
  private attrReg: RegExp = /(?:\(|\s*)(\w+)=['"][^'"]*/;
  private tagStartReg:  RegExp = /<([\w-]*)$/;
  private pugTagStartReg: RegExp = /^\s*[\w-]*$/;
  private size: number = workspace.getConfiguration('element-helper').get('indent-size');

  getPreTag(): TagObject | undefined {
    let line = this._position.line;
    let tag: TagObject | string;
    let txt = this.getTextBeforePosition(this._position);
  
    while (this._position.line - line < 10 && line >= 0) {
      if (line !== this._position.line) {
        txt = this._document.lineAt(line).text;
      }
      tag = this.matchTag(this.tagReg, txt, line);
      
      if (tag === 'break') return;
      if (tag) return <TagObject>tag;
      line--;
    }
    return;
  }

  getPreAttr(): string | undefined {
    let txt = this.getTextBeforePosition(this._position).replace(/"[^'"]*(\s*)[^'"]*$/, '');
    let end = this._position.character;
    let start = txt.lastIndexOf(' ', end) + 1;
    let parsedTxt = this._document.getText(new Range(this._position.line, start, this._position.line, end));

    return this.matchAttr(this.attrReg, parsedTxt);
  }

  matchAttr(reg: RegExp, txt: string): string {
    let match: RegExpExecArray;
    match = reg.exec(txt);
    return !/"[^"]*"/.test(txt) && match && match[1];
  }

  matchTag(reg: RegExp, txt: string, line: number): TagObject | string {
    let match: RegExpExecArray;
    let arr: TagObject[] = [];
 
    if (/<\/?[-\w]+[^<>]*>[\s\w]*<?\s*[\w-]*$/.test(txt) || (this._position.line === line && (/^\s*[^<]+\s*>[^<\/>]*$/.test(txt) || /[^<>]*<$/.test(txt[txt.length - 1])))) {
      return 'break';
    }
    while((match = reg.exec(txt))) {
      arr.push({
        text: match[1],
        offset: this._document.offsetAt(new Position(line, match.index))
      });
    }
    return arr.pop();
  }

  getTextBeforePosition(position: Position): string {
    var start = new Position(position.line, 0);
    var range = new Range(start, position);
    return this._document.getText(range);
  }
  getTagSuggestion() {
    let suggestions = [];

    for (let tag in TAGS) {
      suggestions.push(this.buildTagSuggestion(tag, TAGS[tag]));
    }
    return suggestions;
  }

  getAttrValueSuggestion(tag: string, attr: string): CompletionItem[] {
    let suggestions = [];
    const values = this.getAttrValues(tag, attr);
    values.forEach(value => {
      suggestions.push({
        label: value,
        kind: CompletionItemKind.Value
      });
    });
    return suggestions;
  }

  getAttrSuggestion(tag: string) {
    let suggestions = [];
    let tagAttrs = this.getTagAttrs(tag);
    let preText = this.getTextBeforePosition(this._position);
    let prefix = preText.replace(/['"]([^'"]*)['"]$/, '').split(/\s|\(+/).pop();
    // method attribute
    const method = prefix[0] === '@';
    // bind attribute
    const bind = prefix[0] === ':';

    prefix = prefix.replace(/[:@]/, '');

    if(/[^@:a-zA-z\s]/.test(prefix[0])) {
      return suggestions;
    }

    tagAttrs.forEach(attr => {
      const attrItem = this.getAttrItem(tag, attr);
      if (attrItem && (!prefix.trim() || this.firstCharsEqual(attr, prefix))) {
          const sug = this.buildAttrSuggestion({attr, tag, bind, method}, attrItem);
          sug && suggestions.push(sug);
      }
    });
    for (let attr in ATTRS) {
      const attrItem = this.getAttrItem(tag, attr);
      if (attrItem && attrItem.global && (!prefix.trim() || this.firstCharsEqual(attr, prefix))) {
        const sug = this.buildAttrSuggestion({attr, tag: null, bind, method}, attrItem);
        sug && suggestions.push(sug);
      }
    }
    return suggestions;
  }

  buildTagSuggestion(tag, tagVal) {
    const snippets = [];
    let index = 0;
    function build(tag, {subtags, defaults}, snippets) {
      let attrs = '';
      defaults && defaults.forEach((item, i) => {
        attrs += ` ${item}="$${index + i + 1}"`;
      });
      snippets.push(`${index > 0 ? '<':''}${tag}${attrs}>`);
      index++;
      subtags && subtags.forEach(item => build(item, TAGS[item], snippets));
      snippets.push(`</${tag}>`);
    };
    build(tag, tagVal, snippets);

    return {
      label: tag,
      insertText: new SnippetString(prettyHTML('<' + snippets.join(''), {indent_size: this.size}).substr(1)),
      kind: CompletionItemKind.Snippet,
      detail: 'element-ui',
      documentation: tagVal.description
    };
  }

  buildAttrSuggestion({attr, tag, bind, method}, {description, type}) {
    if ((method && type === "method") || (bind && type !== "method") || (!method && !bind)) {
      return {
        label: attr,
        insertText: (type && (type === 'flag')) ? `${attr} ` : new SnippetString(`${attr}=\"$1\"$0`),
        kind: (type && (type === 'method')) ? CompletionItemKind.Method : CompletionItemKind.Property,
        detail:  tag ?  `<${tag}>` : 'element-ui',
        documentation: description
      };
    } else { return; }
  }

  getAttrValues(tag, attr) {
    let attrItem = this.getAttrItem(tag, attr);
    let options = attrItem && attrItem.options;
    if (!options && attrItem) {
      if (attrItem.type === 'boolean') {
        options = ['true', 'false'];
      } else if (attrItem.type === 'icon') {
        options = ATTRS['icons'];
      } else if (attrItem.type === 'shortcut-icon') {
        options = [];
        ATTRS['icons'].forEach(icon => {
          options.push(icon.replace(/^el-icon-/, ''));
        });
      }
    }
    return options || [];
  }

  getTagAttrs(tag: string) {
    return (TAGS[tag] && TAGS[tag].attributes) || [];
  }

  getAttrItem(tag: string | undefined, attr: string | undefined) {
    return ATTRS[`${tag}/${attr}`] || ATTRS[attr];
  }

  isAttrValueStart(tag: Object | string | undefined, attr) {
    return tag && attr;
  }

  isAttrStart(tag: TagObject | undefined) {
    return tag;
  }

  isTagStart() {
    let txt = this.getTextBeforePosition(this._position);
    return this.isPug() ? this.pugTagStartReg.test(txt) : this.tagStartReg.test(txt);
  }

  firstCharsEqual(str1: string, str2: string) {
    if (str2 && str1) {
      return str1[0].toLowerCase() === str2[0].toLowerCase();
    }
    return false;
  }
  // tentative plan for vue file
  notInTemplate(): boolean {
    let line = this._position.line;
    while(line) {
      if (/^\s*<script.*>\s*$/.test(<string>this._document.lineAt(line).text)) {
        return true;
      }
      line--;
    }
    return false;
  }

  provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<CompletionItem[] | CompletionList> {
    this._document = document;
    this._position = position;
    let tag: TagObject | string | undefined = this.isPug() ?  this.getPugTag() : this.getPreTag();
    let attr = this.getPreAttr();
    if (this.isAttrValueStart(tag, attr)) {
      return this.getAttrValueSuggestion(tag.text, attr);
    } else if(this.isAttrStart(tag)) {
      return this.getAttrSuggestion(tag.text);
    } else if (this.isTagStart()) {
      switch(document.languageId) {
        case 'jade':
        case 'pug':
          return this.getPugTagSuggestion();
        case 'vue':
          if (this.isPug()) {
            return this.getPugTagSuggestion();
          }
          return this.notInTemplate() ? [] : this.getTagSuggestion();
        case 'html':
          // todo
          return this.getTagSuggestion();
      }
    } else {return [];}
  }

  isPug(): boolean {
    if (['pug', 'jade'].includes(this._document.languageId)) {
      return true;
    } else {
      var range = new Range(new Position(0, 0), this._position);
      let txt = this._document.getText(range);
      return /<template[^>]*\s+lang=['"](jade|pug)['"].*/.test(txt);
    }
  }

  getPugTagSuggestion() {
    let suggestions = [];
    
    for (let tag in TAGS) {
      suggestions.push(this.buildPugTagSuggestion(tag, TAGS[tag]));
    }
    return suggestions;
  }

  buildPugTagSuggestion(tag, tagVal) {
    const snippets = [];
    let index = 0;
    let that = this;
    function build(tag, {subtags, defaults}, snippets) {
      let attrs = [];
      defaults && defaults.forEach((item, i) => {
        attrs.push(`${item}='$${index + i + 1}'`);
      });
      snippets.push(`${' '.repeat(index * that.size)}${tag}(${attrs.join(' ')})`);
      index++;
      subtags && subtags.forEach(item => build(item, TAGS[item], snippets));
    };
    build(tag, tagVal, snippets);
    return {
      label: tag,
      insertText: new SnippetString(snippets.join('\n')),
      kind: CompletionItemKind.Snippet,
      detail: 'element-ui',
      documentation: tagVal.description
    };
  }

  getPugTag(): TagObject | undefined {
    let line = this._position.line;
    let tag: TagObject | string;
    let txt = '';
  
    while (this._position.line - line < 10 && line >=0) {
      txt = this._document.lineAt(line).text;
      let match = /^\s*([\w-]+)[.#-\w]*\(/.exec(txt);
      if (match) {
        return {
          text: match[1],
          offset: this._document.offsetAt(new Position(line, match.index))
        };
      }
      line--;
    }
    return;
  }
}