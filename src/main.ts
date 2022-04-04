import { Plugin, PluginSettingTab, Setting } from 'obsidian'
import DataHandler, { LoadOrderEntry } from './multiview/data'
import { MultiviewInstance } from './multiview/instance'
import MultiviewAPI from './multiview/api'

export default class MultiviewPlugin extends Plugin {
    api: MultiviewAPI

    async onload() {
        this.api = new MultiviewAPI(this, await DataHandler.load(this))
        this.app.workspace.onLayoutReady(async () => await this.api.loader.reload())

        this.addSettingTab(new MultiviewSettingsTab(this))
        this.addCommand({
            id: 'reload-modules',
            name: 'Reload JavaScript modules',
            callback: () => {
                MultiviewInstance.clearInstances()
                this.api.loader.reload()
            }
        })

        if (this.api.data.getSetting('enableMultiviewGlobal')) {
            window.multiview = this.api
        }
    }

    onunload() {
        this.api.data.disconnect()

        if (window.multiview === this.api) {
            delete window.multiview
        }

        this.api = undefined
    }
}

class MultiviewSettingsTab extends PluginSettingTab {
    constructor(public plugin: MultiviewPlugin) {
        super(plugin.app, plugin)
    }

    display() {
        this.containerEl.empty()
        this.containerEl.createEl('h2', { text: 'Multiview Settings' })
        this.displayMultiviewGlobalSetting()
        this.displayLoadOrderSettings()
    }

    displayMultiviewGlobalSetting() {
        new Setting(this.containerEl)
            .setName('Enable Multiview Global')
            .setDesc('Enables the multiview JavaScript global variable.')
            .addToggle(t => {
                t.setValue(this.plugin.api.data.getSetting('enableMultiviewGlobal'))
                    .onChange(async value => {
                        if (value === true) {
                            window.multiview = this.plugin.api
                        } else if (window.multiview === this.plugin.api) {
                            delete window.multiview
                        }

                        await this.plugin.api.data.updateSetting('enableMultiviewGlobal', value)
                    })
            })
    }

    displayLoadOrderSettings() {
        const loadOrderDesc = document.createDocumentFragment()
        loadOrderDesc.append(
            'Specifies the order in which JavaScript modules will be loaded. ',
            'Multiple files or folders can be specified by separating each with a semicolon (',
            createEl('code', { text: ';' }), ').',
            createEl('br'),

            'If a folder is specified, subfolders will recursively be searched ',
            'and all JavaScript files found will be loaded.',
            createEl('br'),

            'Within the same load order level, files will be loaded in alphabetical order by full path (',
            createEl('code', { text: 'alpha/zeta.js' }), ' will load before ',
            createEl('code', { text: 'beta.js' }), ').'
        )

        new Setting(this.containerEl)
            .setName('Load Order')
            .setDesc(loadOrderDesc)

        const order = this.plugin.api.data.getSetting('loadOrder', [])
        if (order.length === 0) order.push({ paths: [] })
        for (let i = 0; i < order.length; i++) this.displayLoadOrderItem(i, order)

    }

    displayLoadOrderItem(index: number, order: LoadOrderEntry[]) {
    // Credit to the Templater plugin for this section: https://github.com/SilentVoid13/Templater
        const setting = new Setting(this.containerEl).addSearch(s => {
            // TODO: add a file/folder suggester like Templater's
            s.setValue(order[index].paths.join(';'))
                .setPlaceholder('Folder or File')
                .onChange(async value => {
                    const paths = value.split(';').map(s => s.trim()).filter(s => s !== '')
                    order[index].paths = paths
                    await this.plugin.api.data.flush()
                })

            //@ts-ignore
            s.containerEl.classList.add('mv-settings-search')
        }).addExtraButton(btn => {
            btn.setIcon('up-chevron-glyph')
                .setTooltip('Move Up')
                .onClick(async () => {
                    if (index === 0) return

                    // swap with previous
                    [order[index - 1], order[index]] = [order[index], order[index - 1]]
                    await this.plugin.api.data.flush()
                    this.display()
                })
        }).addExtraButton(btn => {
            btn.setIcon('down-chevron-glyph')
                .setTooltip('Move Down')
                .onClick(async () => {
                    if (index === order.length - 1) return

                    // swap with next
                    [order[index + 1], order[index]] = [order[index], order[index + 1]]
                    await this.plugin.api.data.flush()
                    this.display()
                })
        }).addExtraButton(btn => {
            btn.setIcon('plus')
                .setTooltip('Add Below')
                .onClick(async () => {
                    order.splice(index + 1, 0, { paths: [] })
                    await this.plugin.api.data.flush()
                    this.display()
                })
        }).addExtraButton(btn => {
            btn.setIcon('cross')
                .setTooltip('Delete')
                .onClick(async () => {
                    order.splice(index, 1)
                    await this.plugin.api.data.flush()
                    this.display()
                })
        })

        setting.infoEl.detach()
    }
}
