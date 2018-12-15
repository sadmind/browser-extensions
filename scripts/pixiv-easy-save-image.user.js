// ==UserScript==
// @name         Pixiv easy save image
// @name:zh-TW   Pixiv 簡單存圖
// @name:zh-CN   Pixiv 简单存图
// @namespace    https://blog.maple3142.net/
// @version      0.5.0
// @description  Save pixiv image easily with custom name format and shortcut key.
// @description:zh-TW  透過快捷鍵與自訂名稱格式來簡單的存圖
// @description:zh-CN  透过快捷键与自订名称格式来简单的存图
// @author       maple3142
// @require      https://greasyfork.org/scripts/370765-gif-js-for-user-js/code/gifjs%20for%20userjs.js?version=616920
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://unpkg.com/xfetch-js@0.3.0/xfetch.min.js
// @require      https://unpkg.com/gmxhr-fetch@0.0.6/gmxhr-fetch.min.js
// @match        https://www.pixiv.net/member_illust.php?mode=medium&illust_id=*
// @match        https://www.pixiv.net/
// @match        https://www.pixiv.net/bookmark.php*
// @match        https://www.pixiv.net/new_illust.php*
// @match        https://www.pixiv.net/bookmark_new_illust.php*
// @match        https://www.pixiv.net/ranking.php*
// @match        https://www.pixiv.net/search.php*
// @match        https://www.pixiv.net/member_illust.php*
// @match        https://www.pixiv.net/member.php*
// @connect      pximg.net
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @compatible   firefox >=52
// @compatible   chrome >=55
// @license      MIT
// ==/UserScript==

;(function() {
	'use strict'
	const FORMAT = {
		single: '{{title}}-{{userName}}-{{id}}',
		multiple: '{{title}}-{{userName}}-{{id}}-p{{#}}'
	}
	const KEYCODE_TO_SAVE = 83 // 83 is 's' key

	const sleep = ms => new Promise(res => setTimeout(res, ms))
	const gxf = xf.extend({ fetch: gmfetch })
	const $ = s => document.querySelector(s)
	const $$ = s => [...document.querySelectorAll(s)]
	const elementmerge = (a, b) => {
		Object.keys(b).forEach(k => {
			if (typeof b[k] === 'object') elementmerge(a[k], b[k])
			else if (k in a) a[k] = b[k]
			else a.setAttribute(k, b[k])
		})
	}
	const $el = (s, o) => {
		const el = document.createElement(s)
		elementmerge(el, o)
		return el
	}
	const debounce = delay => fn => {
		let de = false
		return (...args) => {
			if (de) return
			de = true
			fn(...args)
			setTimeout(() => (de = false), delay)
		}
	}
	const download = (url, fname) => {
		const a = $el('a', { href: url, download: fname || true })
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
	}
	const downloadBlob = (blob, fname) => {
		const url = URL.createObjectURL(blob)
		download(url, fname)
		URL.revokeObjectURL(url)
	}
	const blobToImg = blob =>
		new Promise((res, rej) => {
			const src = URL.createObjectURL(blob)
			const img = $el('img', { src })
			img.onload = () => {
				URL.revokeObjectURL(src)
				res(img)
			}
			img.onerror = e => {
				URL.revokeObjectURL(src)
				rej(e)
			}
		})
	const getJSONBody = url => xf.get(url).json(r => r.body)
	const getIllustData = id => getJSONBody(`/ajax/illust/${id}`)
	const getUgoiraMeta = id => getJSONBody(`/ajax/illust/${id}/ugoira_meta`)
	const getCrossOriginBlob = (url, Referer = 'https://www.pixiv.net/') =>
		gxf.get(url, { headers: { Referer } }).blob()
	const saveImage = async ({ single, multiple }, id) => {
		const illustData = await getIllustData(id)
		let results
		const { illustType } = illustData
		switch (illustType) {
			case 0:
			case 1:
				{
					// normal
					const f = illustData.pageCount === 1 ? single : multiple
					const fname = f.replace(/{{(\w+?)}}/g, (m, g1) => illustData[g1])
					const url = illustData.urls.original
					const ext = url
						.split('/')
						.pop()
						.split('.')
						.pop()
					if (illustData.pageCount === 1) {
						results = [[fname + '.' + ext, await getCrossOriginBlob(url)]]
					} else {
						const rgxr = /{{#(\d+)}}/.exec(multiple)
						let offset = 0
						if (rgxr) {
							offset = parseInt(rgxr[1])
						}
						const len = (illustData.pageCount + offset).toString().length
						const ar = []
						for (let i = 0; i < illustData.pageCount; i++) {
							const num = (i + offset).toString().padStart(len, '0')
							ar.push(
								Promise.all([
									`${fname.replace(/{{#(\d+)?}}/g, num)}.${ext}`,
									getCrossOriginBlob(url.replace('p0', `p${i}`))
								])
							)
						}
						results = await Promise.all(ar)
					}
				}
				break
			case 2: {
				// ugoira
				const fname = single.replace(/{{(\w+?)}}/g, (m, g1) => illustData[g1])
				const numCpu = navigator.hardwareConcurrency || 4
				const gif = new GIF({ workers: numCpu * 4, quality: 10 })
				const ugoiraMeta = await getUgoiraMeta(id)
				const ugoiraZip = await xf.get(ugoiraMeta.originalSrc).blob()
				const { files } = await JSZip.loadAsync(ugoiraZip)
				const gifFrames = await Promise.all(Object.values(files).map(f => f.async('blob').then(blobToImg)))
				const getGif = (data, frames) =>
					new Promise((res, rej) => {
						for (let i = 0; i < frames.length; i++) {
							gif.addFrame(frames[i], { delay: data.frames[i].delay })
						}
						gif.on('finished', x => {
							console.timeEnd('gif')
							res(x)
						})
						gif.on('error', rej)
						gif.render()
					})
				results = await [[fname + '.gif', await getGif(ugoiraMeta, gifFrames)]]
			}
		}
		if (results.length === 1) {
			const [f, blob] = results[0]
			downloadBlob(blob, f)
		} else {
			const zip = new JSZip()
			for (const [f, blob] of results) {
				zip.file(f, blob)
			}
			const blob = await zip.generateAsync({ type: 'blob' })
			const zipname = single.replace(/{{(\w+?)}}/g, (m, g1) => illustData[g1])
			downloadBlob(blob, zipname)
		}
	}

	// key shortcut
	{
		const SELECTOR_MAP = {
			'/': 'a.work:hover,a._work:hover,.illust-item-root>a:hover',
			'/bookmark.php': 'a.work:hover,.image-item-image>a:hover',
			'/new_illust.php': 'a.work:hover,.image-item-image>a:hover',
			'/bookmark_new_illust.php': 'figure>div>a:hover,.illust-item-root>a:hover',
			'/member_illust.php': 'div[role=presentation]>a:hover,canvas:hover',
			'/ranking.php': 'a.work:hover,.illust-item-root>a:hover',
			'/search.php': 'figure>div>a:hover',
			'/member.php': '[href^="/member_illust.php"]:hover,.illust-item-root>a:hover'
		}
		const selector = SELECTOR_MAP[location.pathname]
		addEventListener('keydown', e => {
			if (e.which !== KEYCODE_TO_SAVE) return
			e.preventDefault()
			e.stopPropagation()
			let id
			if (!id && $('#Patchouli')) {
				const el = $('.image-item-image:hover>a')
				if (!el) return
				id = /\d+/.exec(el.href.split('/').pop())[0]
			} else if (typeof selector === 'string') {
				const el = $(selector)
				if (!el) return
				if (el.href) id = /\d+/.exec(el.href.split('/').pop())[0]
				else id = new URLSearchParams(location.search).get('illust_id')
			} else {
				id = selector()
			}
			if (id) saveImage(FORMAT, id).catch(console.error)
		})
	}
})()
