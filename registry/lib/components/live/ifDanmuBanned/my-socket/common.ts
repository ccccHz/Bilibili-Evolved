import { EventEmitter, NiceEventEmitter, relayEvent } from './event-emitter'
import { encoder, makeDecoder, Inflates } from './buffer'

export type LiveOptions = {
  protover?: 1 | 2 | 3
  key?: string
  authBody?: any
  uid?: number
  buvid?: string
}

export { relayEvent }

export class Live extends NiceEventEmitter {
  roomid: number
  online: number
  live: boolean
  closed: boolean
  timeout: ReturnType<typeof setTimeout>

  inflates: Inflates

  send: (data: Buffer) => void
  close: () => void

  constructor(
    inflates: Inflates,
    roomid: number,
    {
      send,
      close,
      protover = 3,
      key,
      authBody,
      uid = 0,
      buvid,
    }: { send: (data: Buffer) => void; close: () => void } & LiveOptions,
  ) {
    if (typeof roomid !== 'number' || Number.isNaN(roomid)) {
      throw new Error(`roomid ${roomid} must be Number not NaN`)
    }

    super()
    this.inflates = inflates
    this.roomid = roomid
    this.online = 0
    this.live = false
    this.closed = false
    this.timeout = setTimeout(none, 0)

    this.send = send
    this.close = () => {
      this.closed = true
      close()
    }

    this.on('message', async buffer => {
      const packs = await makeDecoder(inflates)(buffer)
      packs.forEach(({ type, data }) => {
        if (type === 'welcome') {
          this.live = true
          this.emit('live')
          this.send(encoder('heartbeat', inflates))
        }
        if (type === 'heartbeat') {
          this.online = data
          clearTimeout(this.timeout)
          this.timeout = setTimeout(() => this.heartbeat(), 1000 * 30)
          this.emit('heartbeat', this.online)
        }
        if (type === 'message') {
          this.emit('msg', data)
          const cmd = data.cmd || (data.msg && data.msg.cmd)
          if (cmd) {
            if (cmd.includes('DANMU_MSG')) {
              this.emit('DANMU_MSG', data)
            } else {
              this.emit(cmd, data)
            }
          }
        }
      })
    })

    this.on('open', () => {
      if (authBody) {
        if (typeof authBody === 'object') {
          authBody = encoder('join', inflates, authBody)
        }
        this.send(authBody)
      } else {
        const hi: {
          uid: number
          roomid: number
          protover: number
          platform: string
          type: number
          key?: string
          buvid?: string
        } = { uid, roomid, protover, platform: 'web', type: 2 }
        if (key) {
          hi.key = key
        }
        if (buvid) {
          hi.buvid = buvid
        }
        const buf = encoder('join', inflates, hi)
        this.send(buf)
      }
    })

    this.on('close', () => {
      clearTimeout(this.timeout)
    })

    this.on('_error', error => {
      this.close()
      this.emit('error', error)
    })
  }

  heartbeat() {
    this.send(encoder('heartbeat', this.inflates))
  }

  getOnline() {
    this.heartbeat()
    return new Promise<number>(resolve => this.once('heartbeat', resolve))
  }
}

export class KeepLive<Base extends typeof Live> extends EventEmitter {
  params: ConstructorParameters<Base>
  closed: boolean
  interval: number
  timeout: number
  connection: InstanceType<Base>
  Base: Base

  constructor(Base: Base, ...params: ConstructorParameters<Base>) {
    super()
    this.params = params
    this.closed = false
    this.interval = 100
    this.timeout = 45 * 1000
    this.connection = new (Base as any)(...this.params)
    this.Base = Base
    this.connect(false)
  }

  connect(reconnect = true) {
    if (reconnect) {
      this.connection.close()
      this.connection = new (this.Base as any)(...this.params)
    }
    const { connection } = this

    let timeout = setTimeout(() => {
      connection.close()
      connection.emit('timeout')
    }, this.timeout)

    connection.on(relayEvent, (eventName: string, ...params: any[]) => {
      if (eventName !== 'error') {
        this.emit(eventName, ...params)
      }
    })

    connection.on('error', (e: any) => this.emit('e', e))
    connection.on('close', () => {
      if (!this.closed) {
        setTimeout(() => this.connect(), this.interval)
      }
    })

    connection.on('heartbeat', () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        connection.close()
        connection.emit('timeout')
      }, this.timeout)
    })

    connection.on('close', () => {
      clearTimeout(timeout)
    })
  }

  get online() {
    return this.connection.online
  }

  get roomid() {
    return this.connection.roomid
  }

  close() {
    this.closed = true
    this.connection.close()
  }

  heartbeat() {
    return this.connection.heartbeat()
  }

  getOnline() {
    return this.connection.getOnline()
  }

  send(data: Buffer) {
    return this.connection.send(data)
  }
}
