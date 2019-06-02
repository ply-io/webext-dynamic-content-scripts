import pingContentScript from 'webext-content-script-ping';

async function p(fn, ...args) {
	return new Promise((resolve, reject) => fn(...args, r => {
		if (chrome.runtime.lastError) {
			reject(chrome.runtime.lastError);
		} else {
			resolve(r);
		}
	}));
}

export async function addToTab(tab, contentScripts = chrome.runtime.getManifest().content_scripts) {
	if (typeof tab !== 'object' && typeof tab !== 'number') {
		throw new TypeError('Specify a Tab or tabId');
	}

	if (!Array.isArray(contentScripts)) {
		// Single script object, make it an array
		contentScripts = [contentScripts];
	}

	const tabId = tab.id || tab;
	if (!await pingContentScript(tabId)) {
		const injections = [];
		for (const group of contentScripts) {
			const allFrames = group.all_frames;
			const runAt = group.run_at;
			for (const file of group.css || []) {
				injections.push(p(chrome.tabs.insertCSS, tabId, {
					file,
					allFrames,
					runAt
				}));
			}

			for (const file of group.js || []) {
				injections.push(p(chrome.tabs.executeScript, tabId, {
					file,
					allFrames,
					runAt
				}));
			}
		}

		return Promise.all(injections);
	}
}

function getRegexFromGlobs(scripts) {
	const regexStrings = [];
	for (const script of scripts) {
		for (const glob of script.matches) {
			const regexString = glob
				.replace(/^.*:\/\/([^/]+)\/.*/, '$1') // From `https://*.google.com/foo*bar` to `*.google.com`
				.replace(/\./g, '\\.') // Escape dots
				.replace(/\*/g, '.+'); // Converts `*` to `.+`
			regexStrings.push('^' + regexString + '$');
		}
	}

	return new RegExp(regexStrings.join('|'));
}

export function addToFutureTabs(scripts = chrome.runtime.getManifest().content_scripts) {
	const hostsInScripts = getRegexFromGlobs(scripts);

	chrome.tabs.onUpdated.addListener(async (tabId, {status}) => {
		const {url} = await p(chrome.tabs.get, tabId);
		if (!url) {
			return; // No permission on domain
		}

		// Ensure that ontent script is already defined in manifest.json or `scripts` argument
		if (status === 'loading' && !hostsInScripts.test(new URL(url).host)) {
			addToTab(tabId, scripts);
		}
	});
}

export default {
	addToTab,
	addToFutureTabs
};
