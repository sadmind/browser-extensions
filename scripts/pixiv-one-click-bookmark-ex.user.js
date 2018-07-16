// ==UserScript==
// @name         Pixiv 一鍵收藏 EX
// @namespace    https://blog.maple3142.net/
// @version      0.1
// @description  強化版的 pixiv 一鍵收藏，支援收藏與取消
// @author       maple3142
// @match        https://www.pixiv.net/member_illust.php?mode=medium&illust_id=*
// @grant        none
// ==/UserScript==

;(function() {
	'use strict'
	const $ = (s, el = document) => el.querySelector(s)
	const $$ = (s, el = document) => [...el.querySelectorAll(s)]
	const qs = o =>
		Object.keys(o)
			.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(o[k])}`)
			.join('&')
	const getData = id =>
		fetch(`https://www.pixiv.net/ajax/illust/${id}`, {
			method: 'GET',
			credentials: 'include'
		}).then(r => r.json())
	const doPost = url => data =>
		fetch(url, {
			method: 'POST',
			credentials: 'include',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: qs(data)
		})
	const doBookmark = id =>
		doPost('https://www.pixiv.net/rpc/index.php')({
			mode: 'save_illust_bookmark',
			illust_id: id,
			restrict: 0,
			comment: '',
			tags: '',
			tt: globalInitData.token
		}).then(r => r.json())
	const unBookmark = id =>
		getData(id).then(d =>
			doPost('https://www.pixiv.net/bookmark_setting.php')({
				tt: globalInitData.token,
				p: 1,
				untagged: 0,
				rest: 'show',
				'book_id[]': d.body.bookmarkData.id,
				del: 1
			})
		)
	new MutationObserver(mut => {
		const el = $('figure>div>div>section>div>a[href*=bookmark_add]')
		if (el && !el.dataset.oneclick) {
			el.dataset.oneclick = '1'
			const [border, heart] = $$('path', el)
			el.dataset.bookmarked = '0'
			console.log(el)
			if (!el.classList.contains('gtm-main-bookmark')) {
				el.dataset.bookmarked = '1'
			}
			el.addEventListener('click', e => {
				e.preventDefault()
				e.stopPropagation()
				if (el.dataset.bookmarked === '0') {
					doBookmark(new URLSearchParams(location.search).get('illust_id')).then(r => {
						if (r.error) alert('Failed to bookmark!')
						else {
							border.style.fill = heart.style.fill = '#FF4060'
							el.dataset.bookmarked = '1'
						}
					})
				} else {
					unBookmark(new URLSearchParams(location.search).get('illust_id')).then(r => {
						heart.style.fill = '#FFFFFF'
						border.style.fill = '#333'
						el.dataset.bookmarked = '0'
					})
				}
			})
		}
	}).observe(document.body, {
		childList: true,
		subtree: true
	})
})()