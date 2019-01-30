'use strict';

import * as vscode from 'vscode';
import {App, ElementDocsContentProvider, SCHEME, ElementCompletionItemProvider} from './app';
import Library from './library';

export function activate(context: vscode.ExtensionContext) {
    let library = new Library(context);
    let app = new App();
    app.setConfig();
    let docs = new ElementDocsContentProvider();
    let completionItemProvider = new ElementCompletionItemProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, docs);

    let completion = vscode.languages.registerCompletionItemProvider([{
        language: 'pug', scheme: 'file'
    }, {
        language: 'jade', scheme: 'file'
    }, {
        language: 'vue', scheme: 'file'
    }, {
        language: 'html', scheme: 'file'}], completionItemProvider, '\n', '', ' ', ':', '<', '"', "'", '/', '@', '(');
    let vueLanguageConfig = vscode.languages.setLanguageConfiguration('vue', {wordPattern: app.WORD_REG});
    let pugLanguageConfig = vscode.languages.setLanguageConfiguration('pug', {wordPattern: app.WORD_REG});
    let jadeLanguageConfig = vscode.languages.setLanguageConfiguration('jade', {wordPattern: app.WORD_REG});
    
    let disposable = vscode.commands.registerCommand('element-helper.searchUnderCursor', () => {
        if (context.workspaceState.get('element-helper.loading', false)) {
            vscode.window.showInformationMessage('Document is initializing, please wait a minute depend on your network.');
            return;
        }
        
        switch(vscode.window.activeTextEditor.document.languageId) {
            case 'pug':
            case 'jade':
            case 'vue':
            case 'html':
                break;
            default:
                return;
        }

        const selection =  app.getSeletedText();
        let items = library.queryAll().map(item => {
            return {
                label: item.tag,
                detail: item.name,
                path: item.path,
                description: item.type
            };
        });

        if (items.length < 1) {
            vscode.window.showInformationMessage('Initializing。。。, please try again.');
            return;
        }

        let find = items.filter(item => item.label === selection);

        if (find.length) {
            app.openDocs({keyword: find[0].path}, find[0].label);
            return;
        }

        // cant set default value for this method? angry.
        const a = vscode.window.showQuickPick(items).then(selected => {
            selected && app.openDocs({keyword: selected.path}, selected.label);
        })
    });

    context.subscriptions.push(app, disposable, registration, completion, vueLanguageConfig, pugLanguageConfig, jadeLanguageConfig);
}

// this method is called when your extension is deactivated
export function deactivate() {
}