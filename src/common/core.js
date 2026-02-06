export const run = (window, workerUrl) => {
    const $ = window.$; // Use jQuery that is already on the page, v1.12.4

    console.log('Mountaineers Participant Insights loaded');

    let tasksQueue;
    let userDataWorker;

    // Check if current user is a Leader. Only leaders can access activity history and participation notes
    const isLeader = () => {
        return window.UserVoice?.globalOptions?.ticket_custom_fields?.["User Role"] === "Leader";
    };

    const initPage = () => {
        initTasksQueue();
        initWorker();
        cleanCache();
        injectStyles();
    };

    const initTasksQueue = () => {
        if (tasksQueue) return;

        tasksQueue = [];
        const originalPush = tasksQueue.push;
        tasksQueue.push = (...args) => {
            const length = originalPush.apply(tasksQueue, args);
            processQueue();
            return length;
        };
    };

    const initWorker = () => {
        if (userDataWorker) return;

        userDataWorker = new Worker(workerUrl);

        userDataWorker.onmessage = (event) => {
            const { username, result } = event.data;

            if (!result.error) { // Cache result
                try {
                    const dateKey = getLocalDateString();
                    window.localStorage.setItem(`mountaineers_cancellations_${dateKey}_${username}`, JSON.stringify(result));
                } catch (_) { }
            }

            populateUserData(username, result, false);
        };
    };

    // Remove cached items that are not from today
    const cleanCache = () => {
        const todayKeyPrefix = `mountaineers_cancellations_${getLocalDateString()}_`;
        const prefix = 'mountaineers_cancellations_';

        Object.keys(window.localStorage).forEach(key => {
            if (key.startsWith(prefix) && !key.startsWith(todayKeyPrefix)) {
                window.localStorage.removeItem(key);
            }
        });
    };

    // Use Microtip library for tooltips
    const injectStyles = async () => {
        addStyleFromUrl('https://unpkg.com/microtip/microtip.css');
        addStyle(`
            [aria-label][data-microtip-size]::after {
                white-space: pre-wrap; // allow multiline tooltips
            }
        `);
    };

    const addStyle = (css) => {
        window.$('<style>')
            .prop('type', 'text/css')
            .html(css)
            .appendTo('head');
    };

    const addStyleFromUrl = (url) => {
        window.$('<link>')
            .appendTo('head')
            .attr({
                type: 'text/css', 
                rel: 'stylesheet',
                href: url
            });
    };

    const getLocalDateString = () => {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const populateUserData = (username, result, fromCache) => {
        const statsDivSelector = `.mountaineers-cancellations-stats[mountaineers-username="${username}"]`
        const $statsDiv = $(statsDivSelector);
        if (!$statsDiv.length) return;

        if (result.error) {
            $statsDiv.html(toHtmlList([result.error]));
            return;
        }

        const formatStat = (stat) => {
            const pct = stat.total > 0 ? Math.round(((stat.canceled + stat.noShow) / stat.total) * 100) : 0;
            return `${stat.canceled}-${stat.noShow} out of ${stat.total} trip${stat.total !== 1 ? 's' : ''} (${pct}%)`;
        };

        const data = [
            `30d: ${formatStat(result.stats.stats30)}`,
            `90d: ${formatStat(result.stats.stats90)}`,
            `1y: ${formatStat(result.stats.stats365)}`,
            `${result.participationNotes.length} participation note${result.participationNotes.length !== 1 ? 's' : ''} in last year`
        ];
        
        let tooltip = '';
        if (result.participationNotes.length) {
            tooltip += `Participation Notes:\n${result.participationNotes.join("\n")}\n\n`;
        }

        const dateStr = new Date(result.calculatedAt).toLocaleString();
        tooltip += `Calculated: ${dateStr}\nFrom cache: ${fromCache}`;

        $statsDiv
            .html(toHtmlList(data))
            .attr("aria-label", tooltip)
            .attr("data-microtip-position", "top")
            .attr("data-microtip-size", "large")
            .attr("role", "tooltip");
    };

    const processQueue = () => {
        while (tasksQueue.length > 0) {
            const username = tasksQueue.shift();
            const localDate = getLocalDateString();
            const cached = window.localStorage.getItem(`mountaineers_cancellations_${localDate}_${username}`);
            if (cached) {
                populateUserData(username, JSON.parse(cached), true);
            } else {
                userDataWorker.postMessage(username); // Dispatch to worker to fetch and process asynchronously
            }
        }
    };

    const processRosterTab = () => {
        if (!$('div[data-tab="roster-tab"]').length) return;

        initPage();

        // Create an interceptor for XHR requests for "/roster-tab"
        const originalOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            return originalOpen.apply(this, arguments);
        };

        const originalSend = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.send = function() {
            if (this._url && this._url.endsWith('/roster-tab')) {
                this.addEventListener('load', () => {
                    setTimeout(processRosterContacts, 500); // wait for DOM update
                });
            }
            return originalSend.apply(this, arguments);
        };
    };

    const processRosterContacts = () => {
        const $contacts = $('div[data-tab="roster-tab"] .roster-contact');
        if ($contacts.length > 12) return;
        $contacts.each((_, node) => processRosterContact($(node)));
    };

    const processRosterContact = ($element) => {
        if ($element.find('.mountaineers-cancellations').length) return;

        const $link = $element.find('a[href*="/members/"]');
        if (!$link.length) return;

        const href = $link.attr('href');
        const match = href.match(/\/members\/([^/?#]+)/);
        if (!match || !match[1]) return;

        const username = match[1];

        const $htmlContent = `
            <div class="mountaineers-cancellations" style="clear:left; padding:10px 0; font-size:90%; font-weight:normal;">
                <strong>Cancellations and No Shows for Trips</strong>
                <div class="mountaineers-cancellations-stats" mountaineers-username="${username}">
                    ${toHtmlList(["Loading..."])}
                </div>
            </div>
        `;
        $element.append($htmlContent);

        tasksQueue.push(username);
    };

    const processProfilePage = () => {
        const profileMatch = window.location.pathname.match(/^\/members\/([^/]+)\/?$/);
        if (!profileMatch || !profileMatch[1]) return;
        const username = profileMatch[1];

        const $profileDetails = $('.profile-details');
        if (!$profileDetails.length) return;
        if ($('.mountaineers-cancellations').length) return;

        initPage();

        const $htmlContent = `
            <div class="mountaineers-cancellations">
                <h6>Cancellations and No Shows for Trips</h6>
                <div class="mountaineers-cancellations-stats" mountaineers-username="${username}">
                    ${toHtmlList(["Loading..."])}
                </div>
            </div>
        `;
        $profileDetails.before($htmlContent);

        tasksQueue.push(username);
    };

    // Use a list for output to take advantage of existing CSS
    const toHtmlList = (items) => {
        return `
            <ul>
                ${items.map(item => `<li style="background:none;padding:0">${item}</li>`).join('')}
            </ul>
        `;
    };

    if (!isLeader()) return;
    processProfilePage();
    processRosterTab();
};
