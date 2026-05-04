const DATA_DIR = "Data/";

// ------------------ BENDRI PAGALBINIAI ------------------

async function loadSemicolonFile(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error("Nepavyko nuskaityti failo: " + path);

    const text = await resp.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];

    const headers = lines[0].split(";").map(h => h.trim());

    return lines.slice(1).map(line => {
        const parts = line.split(";");
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = (parts[i] ?? "").trim();
        });
        return obj;
    });
}

async function loadRules() {
    try {
        const resp = await fetch(DATA_DIR + "rules.txt");
        if (!resp.ok) {
            document.getElementById("rules-content").textContent =
                "Nepavyko nuskaityti rules.txt";
            return;
        }
        const text = await resp.text();
        document.getElementById("rules-content").textContent = text;
    } catch (e) {
        document.getElementById("rules-content").textContent =
            "Klaida skaitant rules.txt: " + e.message;
    }
}

function getSexFilter() {
    return document.querySelector('input[name="sexFilter"]:checked').value;
}

function denseRankByPoints(arr, pointsField = "total_points") {
    let currentRank = 0;
    let lastPoints = null;
    arr.forEach(r => {
        const pts = r[pointsField];
        if (lastPoints === null || pts !== lastPoints) {
            currentRank += 1;
            lastPoints = pts;
        }
        r.rank = currentRank;
    });
}

function parseTimeToSeconds(t) {
    if (!t || t === "00:00") return 0;
    const [mm, ss] = t.split(":").map(Number);
    return (mm || 0) * 60 + (ss || 0);
}

function formatSecondsToTime(sec) {
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// ------------------ MODALAS ------------------

function setupModal() {
    const overlay = document.getElementById("modal-overlay");
    const closeBtn = document.getElementById("modal-close");

    closeBtn.addEventListener("click", () => overlay.classList.add("hidden"));
    overlay.addEventListener("click", e => {
        if (e.target === overlay) overlay.classList.add("hidden");
    });
}

function openModal(titleText) {
    const overlay = document.getElementById("modal-overlay");
    const title = document.getElementById("modal-title");
    const content = document.getElementById("modal-content");

    title.textContent = titleText;
    content.innerHTML = "Kraunama...";
    overlay.classList.remove("hidden");
    return content;
}

// ------------------ 1. LAST CP - FINIŠAS ------------------

async function loadFinishReport() {
    const container = document.getElementById("results-container");
    container.innerHTML = "Kraunama...";

    try {
        const [resultsFinish, runners, competitions] = await Promise.all([
            loadSemicolonFile(DATA_DIR + "results_finish.txt"),
            loadSemicolonFile(DATA_DIR + "runner.txt"),
            loadSemicolonFile(DATA_DIR + "competition.txt")
        ]);

        const runnerById = new Map();
        runners.forEach(r => runnerById.set(r.runner_id, r));

        const compById = new Map();
        competitions.forEach(c => compById.set(c.comp_id, c));

        const joined = resultsFinish.map(rf => {
            const runner = runnerById.get(rf.runner_id) || {};
            const comp = compById.get(rf.comp_id) || {};
            return {
                runner_id: rf.runner_id,
                runner_name: runner.name || "(nežinomas)",
                runner_sex: runner.sex || "",
                comp_id: rf.comp_id,
                comp_name: comp.comp_name || "(nežinomos varžybos)",
                points: Number(rf.points || 0),
                time: rf.time
            };
        });

        const byRunner = new Map();
        joined.forEach(row => {
            if (!byRunner.has(row.runner_id)) {
                byRunner.set(row.runner_id, {
                    runner_id: row.runner_id,
                    runner_name: row.runner_name,
                    runner_sex: row.runner_sex,
                    details: [],
                    total_points: 0
                });
            }
            const entry = byRunner.get(row.runner_id);
            entry.details.push(row);
            entry.total_points += row.points;
        });

        let runnersArr = Array.from(byRunner.values());

        const sexFilter = getSexFilter();
        if (sexFilter !== "ALL") {
            runnersArr = runnersArr.filter(r => r.runner_sex === sexFilter);
        }

        runnersArr.sort((a, b) => {
            if (b.total_points !== a.total_points) return b.total_points - a.total_points;
            return a.runner_name.localeCompare(b.runner_name, "lt");
        });

        denseRankByPoints(runnersArr);

        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Vieta</th>
                    <th>Dalyvis</th>
                    <th>Taškų suma</th>
                    <th>Detalės</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement("tbody");

        runnersArr.forEach((r, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.rank}</td>
                <td>${r.runner_name}</td>
                <td>${r.total_points}</td>
                <td><button class="details-toggle" data-idx="${idx}">Rodyti</button></td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = "";
        container.appendChild(table);

        container.querySelectorAll(".details-toggle").forEach(btn => {
            btn.addEventListener("click", e => {
                const idx = Number(btn.dataset.idx);
                toggleFinishDetails(runnersArr[idx], table, e.target);
            });
        });

    } catch (e) {
        container.innerHTML = "Klaida generuojant ataskaitą: " + e.message;
    }
}

function toggleFinishDetails(runner, table, buttonElement) {
    const mainRow = buttonElement.closest("tr");
    const existing = mainRow.nextElementSibling;
    if (existing && existing.dataset.detailsFor === runner.runner_id) {
        existing.remove();
        return;
    }

    table.querySelectorAll("tr[data-details-for]").forEach(r => r.remove());

    const detailsTr = document.createElement("tr");
    detailsTr.className = "details-row";
    detailsTr.dataset.detailsFor = runner.runner_id;

    const td = document.createElement("td");
    td.colSpan = 4;

    const innerTable = document.createElement("table");
    innerTable.style.width = "100%";
    innerTable.innerHTML = `
        <thead>
            <tr>
                <th>Varžybos</th>
                <th>Taškai</th>
                <th>Laikas</th>
            </tr>
        </thead>
    `;
    const innerBody = document.createElement("tbody");

    runner.details.forEach(d => {
        const tr = document.createElement("tr");

        const tdComp = document.createElement("td");
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = d.comp_name;
        link.addEventListener("click", e => {
            e.preventDefault();
            showFinishCompetitionModal(d.comp_id, d.comp_name);
        });
        tdComp.appendChild(link);

        tr.appendChild(tdComp);

        const tdPts = document.createElement("td");
        tdPts.textContent = d.points;
        tr.appendChild(tdPts);

        const tdTime = document.createElement("td");
        tdTime.textContent = d.time;
        tr.appendChild(tdTime);

        innerBody.appendChild(tr);
    });

    innerTable.appendChild(innerBody);
    td.appendChild(innerTable);
    detailsTr.appendChild(td);
    mainRow.after(detailsTr);
}

async function showFinishCompetitionModal(comp_id, comp_name) {
    const content = openModal(`Varžybos: ${comp_name}`);
    try {
        const [resultsFinish, runners] = await Promise.all([
            loadSemicolonFile(DATA_DIR + "results_finish.txt"),
            loadSemicolonFile(DATA_DIR + "runner.txt")
        ]);

        const runnerById = new Map();
        runners.forEach(r => runnerById.set(r.runner_id, r));

        const sexFilter = getSexFilter();

        let filtered = resultsFinish.filter(r => r.comp_id === comp_id);
        if (sexFilter !== "ALL") {
            filtered = filtered.filter(r => {
                const rr = runnerById.get(r.runner_id);
                return rr && rr.sex === sexFilter;
            });
        }

        filtered = filtered
            .map(r => ({
                name: runnerById.get(r.runner_id)?.name || "(nežinomas)",
                points: Number(r.points || 0),
                time: r.time
            }))
            .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "lt"));

        if (!filtered.length) {
            content.textContent = "Šiose varžybose taškų nėra.";
            return;
        }

        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Dalyvis</th>
                    <th>Taškai</th>
                    <th>Laikas</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement("tbody");
        filtered.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.name}</td>
                <td>${r.points}</td>
                <td>${r.time}</td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        content.innerHTML = "";
        content.appendChild(table);
    } catch (e) {
        content.textContent = "Klaida kraunant duomenis: " + e.message;
    }
}

// ------------------ 2. START – CP1 ------------------

async function loadStarterReport() {
    const container = document.getElementById("results-container");
    container.innerHTML = "Kraunama...";

    try {
        const [starter, runners, competitions] = await Promise.all([
            loadSemicolonFile(DATA_DIR + "results_starter.txt"),
            loadSemicolonFile(DATA_DIR + "runner.txt"),
            loadSemicolonFile(DATA_DIR + "competition.txt")
        ]);

        const runnerById = new Map();
        runners.forEach(r => runnerById.set(r.runner_id, r));

        const compById = new Map();
        competitions.forEach(c => compById.set(c.comp_id, c));

        const joined = starter.map(s => {
            const runner = runnerById.get(s.runner_id) || {};
            const comp = compById.get(s.comp_id) || {};
            return {
                runner_id: s.runner_id,
                runner_name: runner.name || "(nežinomas)",
                runner_sex: runner.sex || "",
                comp_id: s.comp_id,
                comp_name: comp.comp_name || "(nežinomos varžybos)",
                points: Number(s.points || 0),
                time: s.time,
                cp_number: s.cp_number,
                groups_list: s.groups_list
            };
        });

        const byRunner = new Map();
        joined.forEach(row => {
            if (!byRunner.has(row.runner_id)) {
                byRunner.set(row.runner_id, {
                    runner_id: row.runner_id,
                    runner_name: row.runner_name,
                    runner_sex: row.runner_sex,
                    details: [],
                    total_points: 0
                });
            }
            const entry = byRunner.get(row.runner_id);
            entry.details.push(row);
            entry.total_points += row.points;
        });

        let runnersArr = Array.from(byRunner.values());

        const sexFilter = getSexFilter();
        if (sexFilter !== "ALL") {
            runnersArr = runnersArr.filter(r => r.runner_sex === sexFilter);
        }

        runnersArr.sort((a, b) => {
            if (b.total_points !== a.total_points) return b.total_points - a.total_points;
            return a.runner_name.localeCompare(b.runner_name, "lt");
        });

        denseRankByPoints(runnersArr);

        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Vieta</th>
                    <th>Dalyvis</th>
                    <th>Taškų suma</th>
                    <th>Detalės</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement("tbody");

        runnersArr.forEach((r, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.rank}</td>
                <td>${r.runner_name}</td>
                <td>${r.total_points}</td>
                <td><button class="details-toggle" data-idx="${idx}">Rodyti</button></td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = "";
        container.appendChild(table);

        container.querySelectorAll(".details-toggle").forEach(btn => {
            btn.addEventListener("click", e => {
                const idx = Number(btn.dataset.idx);
                toggleStarterDetails(runnersArr[idx], table, e.target);
            });
        });

    } catch (e) {
        container.innerHTML = "Klaida generuojant Start–cp1 ataskaitą: " + e.message;
    }
}

 
function toggleStarterDetails(runner, table, buttonElement) {
    const mainRow = buttonElement.closest("tr");
    const existing = mainRow.nextElementSibling;
    if (existing && existing.dataset.detailsFor === runner.runner_id) {
        existing.remove();
        return;
    }

    table.querySelectorAll("tr[data-details-for]").forEach(r => r.remove());

    const detailsTr = document.createElement("tr");
    detailsTr.className = "details-row";
    detailsTr.dataset.detailsFor = runner.runner_id;

    const td = document.createElement("td");
    td.colSpan = 5;

    const innerTable = document.createElement("table");
    innerTable.style.width = "100%";
    innerTable.innerHTML = `
        <thead>
            <tr>
                <th>Varžybos</th>
                <th>Taškai</th>
                <th>Laikas</th>
                <th>CP</th>
                <th>Grupės</th>
            </tr>
        </thead>
    `;

    const innerBody = document.createElement("tbody");

    runner.details.forEach(d => {
        const tr = document.createElement("tr");

        // --- Varžybos (su nuoroda) ---
        const tdComp = document.createElement("td");
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = d.comp_name;
        link.addEventListener("click", e => {
            e.preventDefault();
            showStarterCompetitionModal(d.comp_id, d.comp_name);
        });
        tdComp.appendChild(link);
        tr.appendChild(tdComp);

        // --- Taškai ---
        const tdPoints = document.createElement("td");
        tdPoints.textContent = d.points;
        tr.appendChild(tdPoints);

        // --- Laikas ---
        const tdTime = document.createElement("td");
        tdTime.textContent = d.time;
        tr.appendChild(tdTime);

        // --- CP ---
        const tdCp = document.createElement("td");
        tdCp.textContent = d.cp_number;
        tr.appendChild(tdCp);

        // --- Grupės ---
        const tdGroups = document.createElement("td");
        tdGroups.textContent = d.groups_list;
        tr.appendChild(tdGroups);

        innerBody.appendChild(tr);
    });

    innerTable.appendChild(innerBody);
    td.appendChild(innerTable);
    detailsTr.appendChild(td);
    mainRow.after(detailsTr);
}


async function showStarterCompetitionModal(comp_id, comp_name) {
    const content = openModal(`Varžybos: ${comp_name}`);

    try {
        const [starter, runners] = await Promise.all([
            loadSemicolonFile(DATA_DIR + "results_starter.txt"),
            loadSemicolonFile(DATA_DIR + "runner.txt")
        ]);

        const runnerById = new Map();
        runners.forEach(r => runnerById.set(r.runner_id, r));

        const sexFilter = getSexFilter();

        // 1. Filtruojame pagal varžybas
        let filtered = starter.filter(r => r.comp_id === comp_id);

        // 2. Filtruojame pagal lytį
        if (sexFilter !== "ALL") {
            filtered = filtered.filter(r => {
                const rr = runnerById.get(r.runner_id);
                return rr && rr.sex === sexFilter;
            });
        }

        // 3. Surenkame visus CP numerius
        const cpNumbers = [...new Set(filtered.map(r => Number(r.cp_number)))].sort((a, b) => a - b);

        // 4. Sukuriame CP pasirinkimo dropdown
        const cpSelect = document.createElement("select");
        cpSelect.style.marginBottom = "10px";

        cpSelect.innerHTML = `<option value="ALL">Visi pirmieji CP</option>` +
            cpNumbers.map(cp => `<option value="${cp}">${cp}</option>`).join("");

        // Išvalome modalą ir įdedame dropdown
        content.innerHTML = "";
        content.appendChild(cpSelect);

        // 5. Konteineris lentelei
        const tableContainer = document.createElement("div");
        content.appendChild(tableContainer);

        // 6. Lentelės atvaizdavimo funkcija
        function renderTable(cpFilter) {
            let rows = filtered;

            // Filtras pagal CP
            if (cpFilter !== "ALL") {
                rows = rows.filter(r => Number(r.cp_number) === Number(cpFilter));
            }

            // Transformuojame į rodymo formatą
            rows = rows.map(r => ({
                name: runnerById.get(r.runner_id)?.name || "(nežinomas)",
                points: Number(r.points || 0),
                time: r.time,
                cp: Number(r.cp_number),
                groups: r.groups_list
            }));

            // Rūšiavimas: CP ↑, points ↓, vardas ↑
            rows.sort((a, b) => {
                if (a.cp !== b.cp) return a.cp - b.cp;
                if (b.points !== a.points) return b.points - a.points;
                return a.name.localeCompare(b.name, "lt");
            });

            // Generuojame lentelę
            const table = document.createElement("table");
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Dalyvis</th>
                        <th>Taškai</th>
                        <th>Laikas</th>
                        <th>CP</th>
                        <th>Grupės</th>
                    </tr>
                </thead>
            `;

            const tbody = document.createElement("tbody");

            rows.forEach(r => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${r.name}</td>
                    <td>${r.points}</td>
                    <td>${r.time}</td>
                    <td>${r.cp}</td>
                    <td>${r.groups}</td>
                `;
                tbody.appendChild(tr);
            });

            table.appendChild(tbody);

            // Išvalome seną turinį ir įdedame naują lentelę
            tableContainer.innerHTML = "";
            tableContainer.appendChild(table);
        }

        // 7. Reaguojame į CP pasirinkimą
        cpSelect.addEventListener("change", () => {
            renderTable(cpSelect.value);
        });

        // 8. Pradinis atvaizdavimas
        renderTable("ALL");

    } catch (e) {
        content.textContent = "Klaida kraunant duomenis: " + e.message;
    }
}




// ------------------ 3. UNLUCKY 4TH ------------------

async function loadUnluckyReport() {
    const container = document.getElementById("results-container");
    container.innerHTML = "Kraunama...";

    try {
        const [unlucky, runners, competitions] = await Promise.all([
            loadSemicolonFile(DATA_DIR + "results_unlucky4.txt"),
            loadSemicolonFile(DATA_DIR + "runner.txt"),
            loadSemicolonFile(DATA_DIR + "competition.txt")
        ]);

        const runnerById = new Map();
        runners.forEach(r => runnerById.set(r.runner_id, r));

        const compById = new Map();
        competitions.forEach(c => compById.set(c.comp_id, c));

        const joined = unlucky.map(u => {
            const runner = runnerById.get(u.runner_id) || {};
            const comp = compById.get(u.comp_id) || {};
            return {
                runner_id: u.runner_id,
                runner_name: runner.name || "(nežinomas)",
                runner_sex: runner.sex || "",
                comp_id: u.comp_id,
                comp_name: comp.comp_name || "(nežinomos varžybos)",
                points: Number(u.points || 0),
                time: u.time,
                time_sec: parseTimeToSeconds(u.time)
            };
        });

        const byRunner = new Map();
        joined.forEach(row => {
            if (!byRunner.has(row.runner_id)) {
                byRunner.set(row.runner_id, {
                    runner_id: row.runner_id,
                    runner_name: row.runner_name,
                    runner_sex: row.runner_sex,
                    details: [],
                    total_points: 0,
                    total_time_sec: 0
                });
            }
            const entry = byRunner.get(row.runner_id);
            entry.details.push(row);
            entry.total_points += row.points;
            entry.total_time_sec += row.time_sec;
        });

        let runnersArr = Array.from(byRunner.values());

        const sexFilter = getSexFilter();
        if (sexFilter !== "ALL") {
            runnersArr = runnersArr.filter(r => r.runner_sex === sexFilter);
        }

        runnersArr.sort((a, b) => {
            if (b.total_points !== a.total_points) return b.total_points - a.total_points;
            if (a.total_time_sec !== b.total_time_sec) return a.total_time_sec - b.total_time_sec;
            return a.runner_name.localeCompare(b.runner_name, "lt");
        });

        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Vieta</th>
                    <th>Dalyvis</th>
                    <th>Taškų suma</th>
                    <th>Laikų suma</th>
                    <th>Detalės</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement("tbody");

        let currentRank = 0;
        let lastPoints = null;
        let lastTime = null;

        runnersArr.forEach((r, idx) => {
            if (lastPoints === null ||
                r.total_points !== lastPoints ||
                r.total_time_sec !== lastTime) {
                currentRank += 1;
                lastPoints = r.total_points;
                lastTime = r.total_time_sec;
            }
            r.rank = currentRank;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.rank}</td>
                <td>${r.runner_name}</td>
                <td>${r.total_points}</td>
                <td>${formatSecondsToTime(r.total_time_sec)}</td>
                <td><button class="details-toggle" data-idx="${idx}">Rodyti</button></td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = "";
        container.appendChild(table);

        container.querySelectorAll(".details-toggle").forEach(btn => {
            btn.addEventListener("click", e => {
                const idx = Number(btn.dataset.idx);
                toggleUnluckyDetails(runnersArr[idx], table, e.target);
            });
        });

    } catch (e) {
        container.innerHTML = "Klaida generuojant Unlucky 4th ataskaitą: " + e.message;
    }
}

function toggleUnluckyDetails(runner, table, buttonElement) {
    const mainRow = buttonElement.closest("tr");
    const existing = mainRow.nextElementSibling;
    if (existing && existing.dataset.detailsFor === runner.runner_id) {
        existing.remove();
        return;
    }

    table.querySelectorAll("tr[data-details-for]").forEach(r => r.remove());

    const detailsTr = document.createElement("tr");
    detailsTr.className = "details-row";
    detailsTr.dataset.detailsFor = runner.runner_id;

    const td = document.createElement("td");
    td.colSpan = 5;

    const innerTable = document.createElement("table");
    innerTable.style.width = "100%";
    innerTable.innerHTML = `
        <thead>
            <tr>
                <th>Varžybos</th>
                <th>Taškai</th>
                <th>Laikas</th>
            </tr>
        </thead>
    `;
    const innerBody = document.createElement("tbody");

    runner.details.forEach(d => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${d.comp_name}</td>
            <td>${d.points}</td>
            <td>${d.time}</td>
        `;
        innerBody.appendChild(tr);
    });

    innerTable.appendChild(innerBody);
    td.appendChild(innerTable);
    detailsTr.appendChild(td);
    mainRow.after(detailsTr);
}

// ------------------ 4. VELNIO TUZINAS ------------------

async function loadDevilsDozenReport() {
    const container = document.getElementById("results-container");
    container.innerHTML = "Kraunama...";

    try {
        const [vt, runners, competitions] = await Promise.all([
            loadSemicolonFile(DATA_DIR + "results_vt.txt"),
            loadSemicolonFile(DATA_DIR + "runner.txt"),
            loadSemicolonFile(DATA_DIR + "competition.txt")
        ]);

        const runnerById = new Map();
        runners.forEach(r => runnerById.set(r.runner_id, r));

        const compById = new Map();
        competitions.forEach(c => compById.set(c.comp_id, c));

        const joined = vt.map(v => {
            const runner = runnerById.get(v.runner_id) || {};
            const comp = compById.get(v.comp_id) || {};
            return {
                runner_id: v.runner_id,
                runner_name: runner.name || "(nežinomas)",
                runner_sex: runner.sex || "",
                comp_id: v.comp_id,
                comp_name: comp.comp_name || "(nežinomos varžybos)",
                points: Number(v.points || 0),
                time: v.time,
                for_what: v.for_what
            };
        });

        const byRunner = new Map();
        joined.forEach(row => {
            if (!byRunner.has(row.runner_id)) {
                byRunner.set(row.runner_id, {
                    runner_id: row.runner_id,
                    runner_name: row.runner_name,
                    runner_sex: row.runner_sex,
                    details: [],
                    total_points: 0
                });
            }
            const entry = byRunner.get(row.runner_id);
            entry.details.push(row);
            entry.total_points += row.points;
        });

        let runnersArr = Array.from(byRunner.values());

        const sexFilter = getSexFilter();
        if (sexFilter !== "ALL") {
            runnersArr = runnersArr.filter(r => r.runner_sex === sexFilter);
        }

        runnersArr.sort((a, b) => {
            if (b.total_points !== a.total_points) return b.total_points - a.total_points;
            return a.runner_name.localeCompare(b.runner_name, "lt");
        });

        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Vieta</th>
                    <th>Dalyvis</th>
                    <th>Taškų suma</th>
                    <th>Detalės</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement("tbody");

        denseRankByPoints(runnersArr);

        runnersArr.forEach((r, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.rank}</td>
                <td>${r.runner_name}</td>
                <td>${r.total_points}</td>
                <td><button class="details-toggle" data-idx="${idx}">Rodyti</button></td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = "";
        container.appendChild(table);

        container.querySelectorAll(".details-toggle").forEach(btn => {
            btn.addEventListener("click", e => {
                const idx = Number(btn.dataset.idx);
                toggleDevilsDozenDetails(runnersArr[idx], table, e.target);
            });
        });

    } catch (e) {
        container.innerHTML = "Klaida generuojant Velnio tuzino ataskaitą: " + e.message;
    }
}

function toggleDevilsDozenDetails(runner, table, buttonElement) {
    const mainRow = buttonElement.closest("tr");
    const existing = mainRow.nextElementSibling;
    if (existing && existing.dataset.detailsFor === runner.runner_id) {
        existing.remove();
        return;
    }

    table.querySelectorAll("tr[data-details-for]").forEach(r => r.remove());

    const detailsTr = document.createElement("tr");
    detailsTr.className = "details-row";
    detailsTr.dataset.detailsFor = runner.runner_id;

    const td = document.createElement("td");
    td.colSpan = 4;

    const innerTable = document.createElement("table");
    innerTable.style.width = "100%";
    innerTable.innerHTML = `
        <thead>
            <tr>
                <th>Varžybos</th>
                <th>Taškai</th>
                <th>Laikas</th>
                <th>Už ką</th>
            </tr>
        </thead>
    `;
    const innerBody = document.createElement("tbody");

    const sortedDetails = [...runner.details].sort((a, b) =>
        a.comp_id.localeCompare(b.comp_id)
    );

    sortedDetails.forEach(d => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${d.comp_name}</td>
            <td>${d.points}</td>
            <td>${d.time === "00:00" ? "" : d.time}</td>
            <td>${d.for_what}</td>
        `;
        innerBody.appendChild(tr);
    });

    innerTable.appendChild(innerBody);
    td.appendChild(innerTable);
    detailsTr.appendChild(td);
    mainRow.after(detailsTr);
}

// ------------------ 5. AUKSINIS TAŠKAS ------------------

async function loadGoldenReport() {
    const container = document.getElementById("results-container");
    container.innerHTML = "Kraunama...";

    try {
        const [finish, starter, vt, runners, competitions] = await Promise.all([
            loadSemicolonFile(DATA_DIR + "results_finish.txt"),
            loadSemicolonFile(DATA_DIR + "results_starter.txt"),
            loadSemicolonFile(DATA_DIR + "results_vt.txt"),
            loadSemicolonFile(DATA_DIR + "runner.txt"),
            loadSemicolonFile(DATA_DIR + "competition.txt")
        ]);

        const runnerById = new Map();
        runners.forEach(r => runnerById.set(r.runner_id, r));

        const compById = new Map();
        competitions.forEach(c => compById.set(c.comp_id, c));

        const goldenEntries = [];

        finish.forEach(r => {
            const gp = Number(r.golden_point || 0);
            if (gp > 0) {
                goldenEntries.push({
                    runner_id: r.runner_id,
                    comp_id: r.comp_id,
                    comp_name: compById.get(r.comp_id)?.comp_name || "(nežinomos varžybos)",
                    golden_point: gp,
                    source: "finišas"
                });
            }
        });

        starter.forEach(r => {
            const gp = Number(r.golden_point || 0);
            if (gp > 0) {
                goldenEntries.push({
                    runner_id: r.runner_id,
                    comp_id: r.comp_id,
                    comp_name: compById.get(r.comp_id)?.comp_name || "(nežinomos varžybos)",
                    golden_point: gp,
                    source: "startas"
                });
            }
        });

        vt.forEach(r => {
            const gp = Number(r.golden_point || 0);
            if (gp > 0) {
                goldenEntries.push({
                    runner_id: r.runner_id,
                    comp_id: r.comp_id,
                    comp_name: compById.get(r.comp_id)?.comp_name || "(nežinomos varžybos)",
                    golden_point: gp,
                    source: "velnio tuzinas"
                });
            }
        });

        const byRunner = new Map();
        goldenEntries.forEach(row => {
            const runner = runnerById.get(row.runner_id) || {};
            if (runner.sex !== "W") return; // tik moterys

            if (!byRunner.has(row.runner_id)) {
                byRunner.set(row.runner_id, {
                    runner_id: row.runner_id,
                    runner_name: runner.name || "(nežinoma)",
                    runner_sex: runner.sex || "",
                    details: [],
                    total_golden: 0
                });
            }
            const entry = byRunner.get(row.runner_id);
            entry.details.push(row);
            entry.total_golden += row.golden_point;
        });

        let runnersArr = Array.from(byRunner.values());

        const sexFilter = getSexFilter();
        if (sexFilter === "M") {
            runnersArr = []; // vyrai neturi auksinių taškų
        }

        runnersArr.sort((a, b) => {
            if (b.total_golden !== a.total_golden) return b.total_golden - a.total_golden;
            return a.runner_name.localeCompare(b.runner_name, "lt");
        });

        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Vieta</th>
                    <th>Dalyvis</th>
                    <th>Auksinių taškų suma</th>
                    <th>Detalės</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement("tbody");

        denseRankByPoints(runnersArr, "total_golden");

        runnersArr.forEach((r, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.rank}</td>
                <td>${r.runner_name}</td>
                <td>${r.total_golden}</td>
                <td><button class="details-toggle" data-idx="${idx}">Rodyti</button></td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = "";
        container.appendChild(table);

        container.querySelectorAll(".details-toggle").forEach(btn => {
            btn.addEventListener("click", e => {
                const idx = Number(btn.dataset.idx);
                toggleGoldenDetails(runnersArr[idx], table, e.target);
            });
        });

    } catch (e) {
        container.innerHTML = "Klaida generuojant Auksinio taško ataskaitą: " + e.message;
    }
}

function toggleGoldenDetails(runner, table, buttonElement) {
    const mainRow = buttonElement.closest("tr");
    const existing = mainRow.nextElementSibling;
    if (existing && existing.dataset.detailsFor === runner.runner_id) {
        existing.remove();
        return;
    }

    table.querySelectorAll("tr[data-details-for]").forEach(r => r.remove());

    const detailsTr = document.createElement("tr");
    detailsTr.className = "details-row";
    detailsTr.dataset.detailsFor = runner.runner_id;

    const td = document.createElement("td");
    td.colSpan = 4;

    const innerTable = document.createElement("table");
    innerTable.style.width = "100%";
    innerTable.innerHTML = `
        <thead>
            <tr>
                <th>Varžybos</th>
                <th>Iš kur gautas taškas</th>
            </tr>
        </thead>
    `;
    const innerBody = document.createElement("tbody");

    runner.details.forEach(d => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${d.comp_name}</td>
            <td>${d.source}</td>
        `;
        innerBody.appendChild(tr);
    });

    innerTable.appendChild(innerBody);
    td.appendChild(innerTable);
    detailsTr.appendChild(td);
    mainRow.after(detailsTr);
}

// ------------------ FILTRAI IR ATASKAITOS PASIRINKIMAS ------------------

function setupSexFilters() {
    document.querySelectorAll('input[name="sexFilter"]').forEach(radio => {
        radio.addEventListener("change", () => {
            reloadCurrentReport();
        });
    });
}

function setupReportSelector() {
    const select = document.getElementById("reportSelect");
    const title = document.getElementById("results-title");

    select.addEventListener("change", () => {
        if (select.value === "finish") {
            title.textContent = "Last cp - finišas";
            loadFinishReport();
        } else if (select.value === "start") {
            title.textContent = "Start – cp1";
            loadStarterReport();
        } else if (select.value === "unlucky4") {
            title.textContent = "Unlucky 4th";
            loadUnluckyReport();
        } else if (select.value === "devils_dozen") {
            title.textContent = "Velnio tuzinas";
            loadDevilsDozenReport();
        } else if (select.value === "golden") {
            title.textContent = "Auksinis taškas";
            loadGoldenReport();
        }
    });
}

function reloadCurrentReport() {
    const select = document.getElementById("reportSelect");
    const title = document.getElementById("results-title");

    if (select.value === "finish") {
        title.textContent = "Last cp - finišas";
        loadFinishReport();
    } else if (select.value === "start") {
        title.textContent = "Start – cp1";
        loadStarterReport();
    } else if (select.value === "unlucky4") {
        title.textContent = "Unlucky 4th";
        loadUnluckyReport();
    } else if (select.value === "devils_dozen") {
        title.textContent = "Velnio tuzinas";
        loadDevilsDozenReport();
    } else if (select.value === "golden") {
        title.textContent = "Auksinis taškas";
        loadGoldenReport();
    }
}

// ------------------ INIT ------------------

function setupRulesToggle() {
    const wrapper = document.getElementById("rules-content-wrapper");
    const icon = document.querySelector(".toggle-icon");
    const toggleBtn = document.getElementById("rules-toggle");
    const subtitle = document.getElementById("rules-subtitle");

    function toggleRules() {
        wrapper.classList.toggle("expanded");
        icon.classList.toggle("rotated");

        const expanded = wrapper.classList.contains("expanded");
        toggleBtn.setAttribute("aria-expanded", expanded);
    }

    // Paspaudimas ant ikonėlės
    toggleBtn.addEventListener("click", e => {
        e.stopPropagation();
        toggleRules();
    });

    // Paspaudimas ant viso šūkio
    subtitle.addEventListener("click", () => {
        toggleRules();
    });
}

document.addEventListener("DOMContentLoaded", setupRulesToggle);
document.addEventListener("DOMContentLoaded", loadRules);

    setupModal();
    setupSexFilters();
    setupReportSelector();
    // startuojam nuo finišo
    document.getElementById("reportSelect").value = "finish";
    document.getElementById("results-title").textContent = "Last cp - finišas";
    loadFinishReport();


