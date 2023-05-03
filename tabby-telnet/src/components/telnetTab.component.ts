import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import colors from 'ansi-colors'
import { Component, Injector } from '@angular/core'
import { first } from 'rxjs'
import { GetRecoveryTokenOptions, Platform, RecoveryToken } from 'tabby-core'
import { BaseTerminalTabComponent, Reconnectable } from 'tabby-terminal'
import { TelnetProfile, TelnetSession } from '../session'


/** @hidden */
@Component({
    selector: 'telnet-tab',
    template: `${BaseTerminalTabComponent.template} ${require('./telnetTab.component.pug')}`,
    styleUrls: ['./telnetTab.component.scss', ...BaseTerminalTabComponent.styles],
    animations: BaseTerminalTabComponent.animations,
})
export class TelnetTabComponent extends BaseTerminalTabComponent<TelnetProfile> implements Reconnectable {
    Platform = Platform
    session: TelnetSession|null = null
    private reconnectOffered = false

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor (
        injector: Injector,
    ) {
        super(injector)
        this.enableToolbar = true
    }

    ngOnInit (): void {
        this.logger = this.log.create('telnetTab')

        this.subscribeUntilDestroyed(this.hotkeys.hotkey$, hotkey => {
            if (this.hasFocus && hotkey === 'restart-telnet-session') {
                this.reconnect()
            }
        })

        super.ngOnInit()
    }

    protected onFrontendReady (): void {
        this.initializeSession()
        super.onFrontendReady()
    }

    protected attachSessionHandlers (): void {
        const session = this.session!
        this.attachSessionHandler(session.destroyed$, () => {
            if (this.frontend) {
                // Session was closed abruptly
                this.write('\r\n' + colors.black.bgWhite(' TELNET ') + ` ${this.session?.profile.options.host}: session closed\r\n`)

                if (this.profile.behaviorOnSessionEnd === 'reconnect') {
                    this.reconnect()
                } else if (this.profile.behaviorOnSessionEnd === 'keep' || this.profile.behaviorOnSessionEnd === 'auto' && !this.isSessionExplicitlyTerminated()) {
                    if (!this.reconnectOffered) {
                        this.reconnectOffered = true
                        this.write(this.translate.instant(_('Press any key to reconnect')) + '\r\n')
                        this.input$.pipe(first()).subscribe(() => {
                            if (!this.session?.open && this.reconnectOffered) {
                                this.reconnect()
                            }
                        })
                    }
                }
            }
        })
        super.attachSessionHandlers()
    }

    async initializeSession (): Promise<void> {
        this.reconnectOffered = false

        const session = new TelnetSession(this.injector, this.profile)
        this.setSession(session)

        try {
            this.startSpinner(this.translate.instant(_('Connecting')))

            this.attachSessionHandler(session.serviceMessage$, msg => {
                this.write(`\r${colors.black.bgWhite(' Telnet ')} ${msg}\r\n`)
                session.resize(this.size.columns, this.size.rows)
            })

            try {
                await session.start()
                this.stopSpinner()
            } catch (e) {
                this.stopSpinner()
                this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
                return
            }
        } catch (e) {
            this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
        }
    }

    async getRecoveryToken (options?: GetRecoveryTokenOptions): Promise<RecoveryToken> {
        return {
            type: 'app:telnet-tab',
            profile: this.profile,
            savedState: options?.includeState && this.frontend?.saveState(),
        }
    }

    async reconnect (): Promise<void> {
        this.session?.destroy()
        await this.initializeSession()
        this.session?.releaseInitialDataBuffer()
    }

    async canClose (): Promise<boolean> {
        if (!this.session?.open) {
            return true
        }
        return (await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant(_('Disconnect from {host}?'), this.profile.options),
                buttons: [
                    this.translate.instant(_('Disconnect')),
                    this.translate.instant(_('Do not close')),
                ],
                defaultId: 0,
                cancelId: 1,
            },
        )).response === 0
    }

    protected isSessionExplicitlyTerminated (): boolean {
        return super.isSessionExplicitlyTerminated() ||
        this.recentInputs.endsWith('close\r') ||
        this.recentInputs.endsWith('quit\r')
    }

}
