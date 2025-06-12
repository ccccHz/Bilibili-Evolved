// import crypto from 'node:crypto'
import { MD5 } from 'crypto-js'

export interface WbiKeys {
  img_key: string
  sub_key: string
}

function request(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...options.headers,
    },
    ...options,
  })
}

// 获取最新的 img_key 和 sub_key
export async function getWbiKeys(): Promise<WbiKeys> {
  const resp = await request('https://api.bilibili.com/x/web-interface/nav')

  if (!resp.ok) {
    throw new Error(`Failed to get wbi keys: ${resp.statusText}`)
  }

  const data = await resp.json()

  const { img_url } = data.data.wbi_img
  const { sub_url } = data.data.wbi_img

  return {
    img_key: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
    sub_key: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.')),
  }
}

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

// 对 imgKey 和 subKey 进行字符顺序打乱编码
function getMixinKey(orig: string): string {
  let temp = ''
  mixinKeyEncTab.forEach(n => {
    temp += orig[n]
  })
  return temp.slice(0, 32)
}

export function md5(data: string): string {
  return MD5(data).toString()
  // const md5Hash = crypto.createHash('md5')
  // md5Hash.update(data)
  // return md5Hash.digest('hex')
}

interface ParamsObject {
  [key: string]: string | number | boolean
}

// 为请求参数进行 wbi 签名
export function encWbi(params: ParamsObject, img_key: string, sub_key: string): string {
  const mixin_key = getMixinKey(img_key + sub_key)
  const curr_time = Math.round(Date.now() / 1000)
  const chr_filter = /[!'()*]/g
  const query: string[] = []
  Object.assign(params, { wts: curr_time }) // 添加 wts 字段
  // 按照 key 重排参数
  Object.keys(params)
    .sort()
    .forEach(key => {
      query.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(
          // 过滤 value 中的 "!'()*" 字符
          params[key].toString().replace(chr_filter, ''),
        )}`,
      )
    })
  const queryString = query.join('&')
  const wbi_sign = md5(queryString + mixin_key) // 计算 w_rid
  return `${queryString}&w_rid=${wbi_sign}`
}

// 签名
export async function WbiSign(params: ParamsObject): Promise<string> {
  const wbi_keys = await getWbiKeys()
  return encWbi(params, wbi_keys.img_key, wbi_keys.sub_key)
}
