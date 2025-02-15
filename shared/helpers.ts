import * as vscode from 'vscode';
import { EXTENSION_NAME } from './constants';


export const isDevMode = () => {
    const isDev = vscode.workspace.getConfiguration(EXTENSION_NAME).get('general.isDev');
    return isDev;
};