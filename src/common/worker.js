const parseParticipationNotes = (html) => {
    const participationNotes = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const oneYearAgo = new Date(new Date().getTime() - (365 * 24 * 60 * 60 * 1000));

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowContent = rowMatch[1];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            cells.push(cellMatch[1]);
        }
        
        if (cells.length === 6) {
            const rawDate = cells[0].replace(/<[^>]*>/g, '').trim();
            const firstDate = rawDate.split(' - ')[0]; // date might be a range
            const activityDate = new Date(firstDate);

            if (activityDate < oneYearAgo) {
                break; // Sorted descending, so we can stop
            }

            const note = cells[5].replace(/<[^>]*>/g, '').trim();
            if (note) {
                const title = cells[1].replace(/<[^>]*>/g, '').trim();
                participationNotes.push(rawDate + ' - ' + title + ': ' + note);
            }
        }
    }
    return participationNotes;
};

const calculateStats = (activities) => {
    const validActivities = activities.filter(a => 
        a.category === 'trip' && 
        a.trip_results !== 'Canceled' && 
        a.result !== 'Waitlisted'
    );

    const getPeriodStats = (days) => {
        const cutoff = new Date(new Date().getTime() - (days * 24 * 60 * 60 * 1000));
        const periodActivities = validActivities.filter(a => {
            const date = new Date(a.start);
            return date >= cutoff;
        });
        
        const total = periodActivities.length;
        const canceled = periodActivities.filter(a => a.result === 'Canceled').length;
        const noShow = periodActivities.filter(a => a.result === 'No Show').length;
        
        return { canceled: canceled, noShow: noShow, total: total };
    };

    return { stats30: getPeriodStats(30), stats90: getPeriodStats(90), stats365: getPeriodStats(365) };
};

self.onmessage = async (e) => {
    const username = e.data;
    const historyUrl = 'https://www.mountaineers.org/members/' + username + '/member-activity-history.json';
    const reviewsUrl = 'https://www.mountaineers.org/members/' + username + '/review-activities';
    
    try {
        const [historyResponse, reviewsResponse] = await Promise.all([fetch(historyUrl), fetch(reviewsUrl)]);

        const failedResponses = [historyResponse, reviewsResponse].filter(r => !r.ok);
        if (failedResponses.length) {
            const error = failedResponses.map(r => r.url + ": " + r.status + " " + r.statusText).join(', ');
            throw new Error("Failed to fetch data: " + error);
        }

        const result = {
            stats: calculateStats(await historyResponse.json()),
            participationNotes: parseParticipationNotes(await reviewsResponse.text()),
            calculatedAt: new Date().toISOString()
        };
        self.postMessage({ username: username, result: result });
        
    } catch (err) {
        self.postMessage({ username: username, result: { error: err.message } });
    }
};
