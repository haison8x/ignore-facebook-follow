// Gemini: 2 nút ở bên trái mỗi chat trong thanh bên:
//   🗑  Quick delete       -> xoá chat này (không hỏi lại)
//   🧹 Xoá tất cả bên dưới -> xoá mọi chat nằm dưới chat này (hỏi xác nhận 1 lần)
// Mỗi lần xoá đều làm đúng các bước người dùng vẫn làm bằng tay:
//   "..." (actions-menu-button) -> "Delete" (delete-button) -> "Delete" trong dialog xác nhận
// Không gọi API riêng của Gemini, chỉ bấm các nút có sẵn trên giao diện.

const GQD_SETTINGS = {
    geminiQuickDelete: true,
    debugLog: false
};

chrome.storage.local.get(Object.assign({}, GQD_SETTINGS), stored => {
    Object.assign(GQD_SETTINGS, stored);
    gqdRefresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
        return;
    }
    Object.keys(changes).forEach(key => {
        if (key in GQD_SETTINGS) {
            GQD_SETTINGS[key] = changes[key].newValue;
        }
    });
    gqdRefresh();
});

function gqdLog() {
    if (!GQD_SETTINGS.debugLog) {
        return;
    }
    console.log.apply(console, ['%c[IFF-Gemini]', 'color:#1a73e8;font-weight:bold'].concat(Array.from(arguments)));
}

const GQD_ROW_SELECTOR = 'gem-nav-list-item[data-test-id="conversation"]';
const GQD_ROW_ATTR = 'data-iff-gqd';
const GQD_BOX_CLASS = 'iff-gqd-box';
const GQD_DELETE_CLASS = 'iff-gqd-delete';
const GQD_BULK_CLASS = 'iff-gqd-bulk';
const GQD_DELETING_CLASS = 'iff-gqd-deleting';
const GQD_STEP_TIMEOUT = 4000;

// ---------------------------------------------------------------------------
// Giao diện
// ---------------------------------------------------------------------------
const GQD_TRASH_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">'
    + '<path d="M7 21q-.825 0-1.412-.587Q5 19.825 5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413Q17.825 21 17 21Zm10-15H7v13h10ZM9 17h2V8H9Zm4 0h2V8h-2ZM7 6v13Z"/>'
    + '</svg>';
// Thùng rác + các vạch: "xoá hàng loạt"
const GQD_SWEEP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">'
    + '<path d="M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3v10zm2-8h6v8H5zm5-6H6L5 5H2v2h12V5h-3z"/>'
    + '</svg>';
const GQD_STOP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">'
    + '<path d="M6 6h12v12H6z"/></svg>';

function gqdInjectStyle() {
    if (document.getElementById('iff-gemini-style')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'iff-gemini-style';
    style.textContent = `
        ${GQD_ROW_SELECTOR}[${GQD_ROW_ATTR}] { position: relative; }
        /* Chừa chỗ bên trái cho 2 nút. Áp cho cả chat ghim để tiêu đề thẳng hàng */
        ${GQD_ROW_SELECTOR}[${GQD_ROW_ATTR}] > a { padding-left: 64px !important; }
        .${GQD_BOX_CLASS} {
            position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
            display: flex; gap: 2px; z-index: 2;
        }
        .${GQD_BOX_CLASS} button {
            display: inline-flex; align-items: center; justify-content: center;
            width: 28px; height: 28px; padding: 0; margin: 0;
            border: 0; border-radius: 50%; background: transparent;
            color: inherit; opacity: .6; cursor: pointer;
        }
        .${GQD_BOX_CLASS} button:hover { opacity: 1; color: #d93025; background: rgba(217, 48, 37, .1); }
        .${GQD_BOX_CLASS} button[disabled] { cursor: progress; opacity: .3; }
        body.iff-gqd-bulk-running .${GQD_BULK_CLASS} { opacity: 1; color: #d93025; }
        ${GQD_ROW_SELECTOR}.${GQD_DELETING_CLASS} > a { opacity: .4; pointer-events: none; }
    `;
    document.head.appendChild(style);
}

function gqdTitle(row) {
    const link = row.querySelector('a[aria-label]');
    return (link && link.getAttribute('aria-label')) || row.getAttribute('data-conversation-id') || '(không rõ)';
}

function gqdIsPinned(row) {
    return !!row.querySelector('[fonticonname="push_pin"], [aria-label="Pinned chat"]');
}

function gqdMakeButton(className, svg, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = svg;
    // Nút nằm đè lên link của chat -> chặn để không mở chat khi bấm
    ['pointerdown', 'mousedown'].forEach(type => {
        button.addEventListener(type, event => event.stopPropagation());
    });
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });
    return button;
}

function gqdDecorateRow(row) {
    row.setAttribute(GQD_ROW_ATTR, '1');
    const box = row.querySelector(':scope > .' + GQD_BOX_CLASS);

    // Chat đã ghim: không gắn nút, tránh xoá nhầm chat đang giữ lại
    if (gqdIsPinned(row) || !row.querySelector('[data-test-id="actions-menu-button"]')) {
        if (box) {
            box.remove();
        }
        return;
    }
    if (box) {
        return;
    }

    const newBox = document.createElement('span');
    newBox.className = GQD_BOX_CLASS;
    newBox.appendChild(gqdMakeButton(GQD_DELETE_CLASS, GQD_TRASH_SVG,
        'Xoá chat này (không hỏi lại)', () => gqdEnqueue(row, gqdGeneration)));
    newBox.appendChild(gqdMakeButton(GQD_BULK_CLASS, GQD_SWEEP_SVG,
        'Xoá tất cả chat bên dưới chat này', () => gqdOnBulkClick(row)));
    row.insertBefore(newBox, row.firstChild);
}

function gqdUndecorateAll() {
    document.querySelectorAll('.' + GQD_BOX_CLASS).forEach(box => box.remove());
    document.querySelectorAll('[' + GQD_ROW_ATTR + ']').forEach(row => row.removeAttribute(GQD_ROW_ATTR));
}

function gqdRefresh() {
    if (!GQD_SETTINGS.geminiQuickDelete) {
        gqdUndecorateAll();
        return;
    }
    const rows = document.querySelectorAll(GQD_ROW_SELECTOR);
    if (!rows.length || !document.head) {
        return;
    }
    gqdInjectStyle();
    rows.forEach(gqdDecorateRow);
}

// ---------------------------------------------------------------------------
// Xoá tất cả bên dưới
// ---------------------------------------------------------------------------
let gqdPending = 0;
let gqdBulkRunning = false;

function gqdSetBulkRunning(running) {
    gqdBulkRunning = running;
    document.body.classList.toggle('iff-gqd-bulk-running', running);
    document.querySelectorAll('.' + GQD_BULK_CLASS).forEach(button => {
        button.innerHTML = running ? GQD_STOP_SVG : GQD_SWEEP_SVG;
        button.title = running ? 'Đang xoá... bấm để dừng' : 'Xoá tất cả chat bên dưới chat này';
    });
}

function gqdRowsBelow(row) {
    return Array.from(document.querySelectorAll(GQD_ROW_SELECTOR)).filter(other =>
        other !== row
        && (row.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)
        && !gqdIsPinned(other)
        && !other.classList.contains(GQD_DELETING_CLASS));
}

function gqdOnBulkClick(row) {
    // Đang xoá hàng loạt -> bấm lần nữa là dừng
    if (gqdBulkRunning) {
        gqdCancelAll('người dùng bấm dừng');
        return;
    }

    const below = gqdRowsBelow(row);
    if (!below.length) {
        window.alert('Không có chat nào (chưa ghim) bên dưới "' + gqdTitle(row) + '".');
        return;
    }
    const ok = window.confirm('Xoá ' + below.length + ' chat bên dưới "' + gqdTitle(row) + '"?\n\n'
        + 'Chat ghim sẽ được giữ lại. Không thể hoàn tác.\n'
        + 'Chỉ xoá các chat đang được tải trong danh sách (cuộn xuống để tải thêm).');
    if (!ok) {
        return;
    }

    gqdLog('xoá hàng loạt ' + below.length + ' chat bên dưới "' + gqdTitle(row) + '"');
    gqdSetBulkRunning(true);
    below.forEach(other => gqdEnqueue(other, gqdGeneration));
}

// ---------------------------------------------------------------------------
// Hàng đợi xoá: chạy tuần tự từng chat, vì mỗi lần chỉ mở được 1 menu / 1 dialog
// ---------------------------------------------------------------------------
let gqdQueue = Promise.resolve();
// Tăng lên khi bấm dừng -> các việc đã xếp hàng với số cũ sẽ bị bỏ qua
let gqdGeneration = 0;

function gqdMarkDeleting(row, deleting) {
    row.classList.toggle(GQD_DELETING_CLASS, deleting);
    const button = row.querySelector('.' + GQD_DELETE_CLASS);
    if (button) {
        button.disabled = deleting;
    }
}

function gqdCancelAll(why) {
    gqdGeneration++;
    gqdLog('dừng xoá (' + why + ')');
    document.querySelectorAll('.' + GQD_DELETING_CLASS).forEach(row => gqdMarkDeleting(row, false));
    gqdSetBulkRunning(false);
}

function gqdEnqueue(row, generation) {
    if (row.classList.contains(GQD_DELETING_CLASS)) {
        return;
    }
    gqdMarkDeleting(row, true);
    gqdPending++;

    const title = gqdTitle(row);
    gqdQueue = gqdQueue
        .then(() => {
            if (generation !== gqdGeneration) {
                return;
            }
            return gqdDelete(row, title);
        })
        .catch(error => {
            console.warn('[IFF-Gemini] xoá thất bại: "' + title + '" -', error.message);
            gqdMarkDeleting(row, false);
            gqdPressEscape();
            // Xoá hàng loạt mà 1 chat lỗi -> dừng luôn, tránh bấm lung tung
            if (gqdBulkRunning) {
                gqdCancelAll('lỗi khi xoá "' + title + '"');
            }
        })
        .then(() => {
            gqdPending--;
            if (gqdPending === 0 && gqdBulkRunning) {
                gqdLog('xoá hàng loạt xong');
                gqdSetBulkRunning(false);
            }
        });
}

function gqdSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Chờ tới khi find() trả về phần tử (kiểm tra mỗi 100ms)
async function gqdWaitFor(find, what) {
    const start = Date.now();
    while (Date.now() - start < GQD_STEP_TIMEOUT) {
        const found = find();
        if (found) {
            return found;
        }
        await gqdSleep(100);
    }
    throw new Error('không thấy ' + what + ' sau ' + GQD_STEP_TIMEOUT + 'ms');
}

function gqdIsVisible(el) {
    return !!el && el.getClientRects().length > 0;
}

function gqdFindMenuDeleteButton() {
    const buttons = document.querySelectorAll('.cdk-overlay-container [data-test-id="delete-button"]');
    return Array.from(buttons).find(gqdIsVisible) || null;
}

function gqdFindConfirmButton() {
    const dialogs = Array.from(document.querySelectorAll('mat-dialog-container, [role="dialog"]')).filter(gqdIsVisible);
    for (const dialog of dialogs) {
        const buttons = Array.from(dialog.querySelectorAll('mat-dialog-actions button, [mat-dialog-actions] button'));
        // Nút "Delete" theo chữ; nếu giao diện không phải tiếng Anh thì lấy nút
        // được focus mặc định (cdkfocusinitial), chính là nút xác nhận
        const byText = buttons.find(button => button.textContent.trim() === 'Delete');
        const byFocus = dialog.querySelector('[cdkfocusinitial] button');
        const confirm = byText || byFocus;
        if (confirm && confirm.getAttribute('aria-disabled') !== 'true' && !confirm.disabled) {
            return confirm;
        }
    }
    return null;
}

function gqdPressEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
}

function gqdFindRow(conversationId) {
    return conversationId
        ? document.querySelector(GQD_ROW_SELECTOR + '[data-conversation-id="' + conversationId + '"]')
        : null;
}

async function gqdDelete(row, title) {
    const conversationId = row.getAttribute('data-conversation-id');
    gqdLog('bắt đầu xoá: "' + title + '"', conversationId);

    // Row có thể đã bị Angular dựng lại -> tìm lại theo id
    const liveRow = gqdFindRow(conversationId) || row;
    if (!document.contains(liveRow)) {
        gqdLog('chat không còn trong danh sách, bỏ qua: "' + title + '"');
        return;
    }

    // 1. Mở menu "..."
    const menuTrigger = liveRow.querySelector('[data-test-id="actions-menu-button"] button')
        || liveRow.querySelector('[data-test-id="actions-menu-button"]');
    if (!menuTrigger) {
        throw new Error('không thấy nút "..."');
    }
    menuTrigger.click();

    // 2. Bấm "Delete" trong menu
    const menuDelete = await gqdWaitFor(gqdFindMenuDeleteButton, 'mục "Delete" trong menu');
    gqdLog('bấm "Delete" trong menu');
    menuDelete.click();

    // 3. Bấm "Delete" trong dialog xác nhận
    const confirm = await gqdWaitFor(gqdFindConfirmButton, 'nút "Delete" trong dialog xác nhận');
    gqdLog('bấm xác nhận "Delete"');
    confirm.click();

    // 4. Chờ chat biến khỏi danh sách rồi mới xoá chat kế tiếp
    await gqdWaitFor(() => conversationId ? !gqdFindRow(conversationId) : !document.contains(liveRow),
        'chat biến khỏi danh sách');
    gqdLog('đã xoá: "' + title + '"');
}

// ---------------------------------------------------------------------------
// Danh sách chat được Angular vẽ lại liên tục (cuộn, tải thêm...) -> gắn lại nút
// ---------------------------------------------------------------------------
let gqdRefreshTimer = null;

function gqdScheduleRefresh() {
    if (gqdRefreshTimer) {
        return;
    }
    gqdRefreshTimer = setTimeout(() => {
        gqdRefreshTimer = null;
        gqdRefresh();
    }, 200);
}

new MutationObserver(gqdScheduleRefresh).observe(document.documentElement, {
    childList: true,
    subtree: true
});
