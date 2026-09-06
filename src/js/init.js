/**
 * 按点击目标的 ID、类名和父容器分发页面操作。
 *
 * @param {MouseEvent} event - 冒泡到 `document` 的点击事件；分发器读取 `event.target`，若命中按钮内
 *   的 `<p>` 会提升到父按钮，再依据 ID、类名和容器决定操作。事件坐标仅在选择波纹效果中使用，
 *   主输入区内的 `<p>` 保留为光标定位目标。
 */
document.addEventListener('click', (event) => {
    "use strict";

    let target = event.target;

    // 键帽文字由内部 p 元素承载；除主输入区外统一提升到按钮容器，保证点击图标和空白处行为一致。
    if (target.tagName.toLowerCase() === 'p' && target.parentNode?.id !== 'input') {
        target = target.parentNode;
    }

    const {id: targetID, className: targetClass} = target;

    const firstChildClass = target.firstElementChild?.className || '';
    const parent = target.parentNode;
    const parentID = parent?.id || '';

    // 第一层按目标 ID 精确分发，处理全局唯一控件。
    switch (targetID) {
        case 'head_setting':
            PageControlTools.hideExplain();
            return PageControlTools.headChangeModes();

        case 'head_title':
            return PageControlTools.moveShip();

        case 'main_cover':
            return PageControlTools.clickMainCover();

        case 'print_close':
            return PageControlTools.closePrint();

        case 'head_explain':
        case 'explain_close':
            return PageControlTools.headChangeExplain();

        case 'input':
            PageControlTools.hideExplain();
            if (HtmlTools.isScrolledToRight(HtmlTools.getHtml('#input'))) {
                InputManager.moveCursor('end');
            }
            return;

        case 'load_cancel':
            return PageControlTools.cancelPrint();

        case 'print_1_0_choose':
            return PageControlTools.clickPrint1Choose();

        case 'print_content_1_cover':
            return PageControlTools.clickPrint1Cover();

        case 'statistics_results_top_x':
        case 'statistics_results_top_y':
        case 'statistics_results_top_xy':
            PageControlTools.triggerSelection(target, event);
            return PageControlTools.switchStatisticsResults(targetID.slice(23));

        case 'back_btn':
        case 'back_btn_child1':
        case 'back_btn_child2':
        case 'back_btn_father':
            PageConfig.currentMode = '2_0';
            return;
    }

    const showMoreFunc = () => PageControlTools.changeSubKeyboard('SortSvg');

    // 第二层按父容器分组，同一控件内部的图标和文字共享处理逻辑。
    switch (parentID) {
        case 'setting_acc_control':
        case 'switch_knob_on':
        case 'switch_knob_off':
        case 'switch_knob':
        case 'switch_container':
        case 'switch_container_father':
            PageConfig.calcAccMode = 1 - PageConfig.calcAccMode;
            return;

        case 'sort_svg':
        case 'keyboard_top_more':
            return showMoreFunc();

        case 'keyboard_top': {
            const handlers = {
                '_2nd_': () => PageConfig.keyboardType = 1 - PageConfig.keyboardType,
                '_trigonometry_': () => PageControlTools.changeSubKeyboard('_trigonometry_'),
                '_functions_': () => PageControlTools.changeSubKeyboard('_functions_')
            };

            if (handlers[firstChildClass]) {
                handlers[firstChildClass]();
            } else if (targetID === 'keyboard_top_more') {
                showMoreFunc();
            } else {
                PageControlTools.hideExplain();

                const direction = firstChildClass.slice(13).toLowerCase();
                if (direction) {
                    InputManager.moveCursor(direction);
                }
            }
            return;
        }
    }

    // 第三层处理带规则命名的动态元素，避免为每个模式、单元格或按键逐一注册监听器。
    if (parentID.startsWith('screen_input_')) {
        PageControlTools.hideExplain();
        const modeIndex = parentID.slice(-1);
        PageConfig.subModes = {'default': modeIndex};
        PageControlTools.syncScreenToInput();
        return;
    }

    if (parentID === 'input' && targetID === '') {
        PageControlTools.hideExplain();
        return InputManager.clickMoveCursor(target);
    }

    if (targetID.includes('keyboard_cover')) {
        return PageControlTools.changeSubKeyboard('allNotShow');
    }

    if (/^mode_[0-4]$/.test(targetID)) {
        const mode = targetID.slice(-1);
        PageConfig.currentMode = (mode === '2') ? '2_0' : mode;

        setTimeout(() => PageControlTools.clickMainCover(), 340);
        return;
    }

    if (/Data[XY]/.test(targetClass)) {
        PageControlTools.hideExplain();

        const children = target.parentElement.children;
        const name = [];

        const classList = HtmlTools.getClassList(children[0].children[0]);
        name.push(classList ? Number(classList.join('').replace(/_/g, '')) - 1 : 0);
        name.push(target.classList.contains('DataX') ? 0 : 1);

        PageConfig.subModes = {'default': name};
        PageControlTools.syncScreenToInput();
        return;
    }

    if (/^print_[0-1]$/.test(targetID)) {
        PageConfig.printMode = targetID.slice(-1);
        return;
    }

    if (/KeyboardStyle(?:[123]|EXE)/.test(targetClass)) {
        PageControlTools.hideExplain();
        switch (firstChildClass) {
            case '_exe_':
                return PrintManager.exe();
            case '_ac_':
                return InputManager.ac();
            case '_del_':
                InputManager.del();
                if (PageConfig.currentMode === '0') {
                    PrintManager.mode0ShowOnScreen();
                }
                return;
            case '_add_line_':
                const currentSubModes = PageConfig.subModes['1'];
                const succeed = InputManager.statisticsAddLine({
                    location: currentSubModes[0] - 1,
                    inputX: currentSubModes[1] === 0 ? '0' : '',
                    inputY: currentSubModes[1] === 0 ? '' : '0'
                });
                if (succeed && !HtmlTools.getHtml('.InputTip')) {
                    InputManager.ac();
                }
                return HtmlTools.scrollToView();
            case '_del_line_':
                InputManager.statisticsDelLine();
                return HtmlTools.scrollToView();
            default: {
                const input = HtmlTools.getClassList(target);
                InputManager.input(input);
                if (targetClass.includes('NeedParentheses') && PageConfig.keyboardType === 1) {
                    InputManager.input(['_parentheses_left_']);
                }
                if (PageConfig.currentMode === '0') {
                    PrintManager.mode0ShowOnScreen();
                }
                PageControlTools.showExplain(input);
            }
        }
        return;
    }

    if (/title_mode_([0134]|2_0)|screen_title|print_title/.test(targetID)) {
        // 嵌入式环境关闭网页专属全屏；函数值结果页的标题也不作为全屏触发区。
        if (!Public.webMode || (targetID !== 'print_title' && PageConfig.currentMode === '2_1')) {
            return;
        }

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
        return;
    }

    if (/^choose_ra_[0-6]$/.test(parentID)) {
        return PageControlTools.changePrint1Ra(parentID);
    }

    if (/^export_[0-1]$/.test(targetID)) {
        return PageControlTools.exportRa(targetID);
    }
});

/**
 * 将物理键盘输入分发到计算器操作。
 *
 * @param {KeyboardEvent} event - 冒泡到 `document` 的按键事件；使用标准化的 `event.key` 区分
 *   Backspace、方向键、Enter、Escape、数字和运算符。处理过的计算器快捷键会阻止浏览器默认行为，
 *   未映射按键继续交给页面或系统处理；组合键修饰状态由各分支按需读取。
 */
document.addEventListener('keydown', (event) => {
    "use strict";

    const key = event.key;

    PageControlTools.hideExplain();

    switch (key) {
        case 'Backspace':
            event.preventDefault();
            InputManager.del('left', event.shiftKey);
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;

        case 'Delete':
            event.preventDefault();
            InputManager.del('right', event.shiftKey);
            if (PageConfig.currentMode === '0') {
                PrintManager.mode0ShowOnScreen();
            }
            return;

        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
            event.preventDefault();

            return InputManager.moveCursor(key.slice(5).toLowerCase(), event.shiftKey);

        case 'Enter':
            event.preventDefault();

            // Enter 按 UI 层级处理：先关闭模态遮罩，再退出/取消结果页，最后才提交当前表达式。
            if (!HtmlTools.getHtml('#main_cover').classList.contains('NoDisplay')) {
                return PageControlTools.clickMainCover();
            }

            if (!HtmlTools.getHtml('#main').classList.contains('Input')) {
                if (!HtmlTools.getHtml('#load_cover').classList.contains('NoDisplay')) {
                    return PageControlTools.cancelPrint();
                }
                return PageControlTools.closePrint();
            }

            return PrintManager.exe();
    }

    if (/^([a-z0-9E])$/.test(key)) {
        event.preventDefault();

        if (event.altKey && ['e', 'i', 'x'].includes(key)) {
            // Alt+e/i/x 输入数学变量样式，普通按键仍保留字母词元，避免两种含义混淆。
            const input = [`_${key}_mathit_`];
            InputManager.input(input);
            PageControlTools.showExplain(input);
        } else {
            const input = [`_${key}_`];
            InputManager.input(input);
            PageControlTools.showExplain(input);
        }
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
        return;
    }

    if (/^[+\-*/^|!,.()]$/.test(key)) {
        event.preventDefault();

        InputManager.input(HtmlTools.textToHtmlClass(HtmlTools.deleteIllegal(key)));
        if (PageConfig.currentMode === '0') {
            PrintManager.mode0ShowOnScreen();
        }
    }
});

/** 页面加载后按依赖顺序恢复持久化状态。 */
window.addEventListener('load', () => {
    "use strict";

    const getStore = (key) => localStorage.getItem(key);

    /**
     * 恢复单项本地数据，并清除无法解析的值。
     *
     * @param {string} dataName - 要读取、校验并在损坏时删除的精确 `localStorage` 键名；缺失键不会删除
     *   其他状态，也不会把字符串 `null` 当作缺失值。
     * @param {function(string): void} func - 键存在时同步执行的恢复函数；参数是存储中的原始字符串，
     *   JSON 解析或业务校验由回调负责。回调抛错即视为该项损坏并触发清理与缺省恢复。
     * @param {function()} [defaultFunc=null] - 键缺失或恢复失败时调用的无参初始化函数；
     *   `null` 表示无需额外初始化。失败路径最多调用一次，不接收已损坏的原值。
     * @returns {void}
     */
    const recoverData = (dataName, func, defaultFunc = null) => {
        const currentData = getStore(dataName);

        try {
            if (currentData !== null) {
                func(currentData);
            } else if (defaultFunc) {
                defaultFunc();
            }
        } catch (e) {
            console.warn(`[GLOBAL] LocalStorage ${dataName} corrupted, resetting.`);
            localStorage.removeItem(dataName);
        }
    };

    // 恢复顺序不可交换：模式先建立页面上下文，输入数据随后决定子模式的合法范围，最后恢复显示选项。
    recoverData('currentMode', (data) => {
        PageConfig.currentMode = data;
    });

    recoverData('screenData', (data) => {
        data = JSON.parse(data);
        for (const key in data) {
            const inner = data[key];
            if (key !== '1') {
                const place = HtmlTools.getHtml(`#screen_input_inner_${key}`);
                HtmlTools.appendDOMs(place, HtmlTools.textToHtmlClass(inner), {mode: 'replace'});
            } else {
                const lastItem = inner.at(-1);
                // 统计表始终保留一个空白末行供继续输入，同时限制恢复数据的最大行数。
                if (lastItem[0].length !== 0 || lastItem[1].length !== 0) {
                    inner.push(['', '']);
                }

                if (inner.length > InputManager.MAX_STATISTICS_ROW) {
                    inner.length = InputManager.MAX_STATISTICS_ROW;
                }
            }
            PageConfig.screenData = {[key]: inner};
        }
    });

    recoverData('subModes', (data) => {
        data = JSON.parse(data);
        const dataLen = PageConfig.screenData['1'].length;
        // 存储的数据行可能已被最大行数限制截断，选中坐标必须随之回退到最后一行。
        if (data['1'][0] + 1 > dataLen) {
            data['1'][0] = dataLen - 1;
        }
        PageConfig.subModes = data;
    });

    recoverData('keyboardType', (data) => {
        PageConfig.keyboardType = Number(data);
    });

    recoverData('printMode', (data) => {
        PageConfig.printMode = data;
    });

    recoverData(
        'calcAccMode',
        (data) => PageConfig.calcAccMode = Number(data),
        () => PageConfig.calcAccMode = 0
    );

    HtmlTools.scrollToView();
});