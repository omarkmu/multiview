import MultiviewAPI from './multiview/api'
import { DataviewAPI } from 'obsidian-dataview'

declare global {
    interface Window {
        multiview?: MultiviewAPI
    }

    let multiview: MultiviewAPI
}
declare module 'obsidian' {
    interface App {
        plugins: {
            enabledPlugins: Set<string>
            plugins: {
                [id: string]: unknown
                dataview?: {
                    api?: DataviewAPI
                }
            }
        }
    }
}
