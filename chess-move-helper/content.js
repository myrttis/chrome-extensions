(function () {
  "use strict";

  var FILES = "abcdefgh";
  var PIECE_CN = { p:"兵", r:"车", n:"马", b:"象", q:"后", k:"王" };

  var BOARD_SELS = [
    "chess-board", "wc-chess-board",
    ".board", ".board-layout-chessboard",
    "#board-single", "#board-layout-chessboard",
    '[class*="board-chessboard"]', '[class*="game-board"]',
    '[class*="play-board"]', '[class*="board-container"]',
    '[class*="chessboard"]', '.board-b72b1',
  ];

  var S = {
    boardEl: null,       // outer container (for event listener)
    boardGrid: null,     // actual square grid (for coordinate calc)
    boardRoot: null,     // where pieces live (root for querySelector)
    overlay: null,
    pool: [],
    poolN: 0,
    selected: null,
    flipped: false,
    engine: null,
    engineFen: "",
    infoEl: null,
    matePanel: null,
    statusEl: null,
    _obsTimer: null,
    _mateTimer: null,
    _infoTimer: null,
    _clickFn: null,
    _keyFn: null,
    _boardObs: null,
    _bodyObs: null,
    _urlObs: null,
    _retryCount: 0,
  };

  function log() {
    var a = ["[CMH]"];
    for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
    console.log.apply(console, a);
  }

  function setStatus(text, color) {
    if (!S.statusEl) {
      S.statusEl = document.createElement("div");
      S.statusEl.style.cssText =
        "position:fixed;bottom:8px;left:8px;padding:4px 10px;border-radius:6px;" +
        "font:12px/1.4 'Segoe UI',Arial,sans-serif;z-index:999999;pointer-events:none;" +
        "opacity:0;transition:opacity .3s;box-shadow:0 1px 6px rgba(0,0,0,.3)";
      document.body.appendChild(S.statusEl);
    }
    S.statusEl.textContent = text;
    S.statusEl.style.background = color || "rgba(30,30,30,.9)";
    S.statusEl.style.color = "#fff";
    S.statusEl.style.opacity = "1";
    clearTimeout(S._infoTimer);
    S._infoTimer = setTimeout(function() {
      if (S.statusEl) S.statusEl.style.opacity = "0";
    }, 3000);
  }

  // ============================================
  //  Board detection: find container + grid
  // ============================================
  function findBoard() {
    log("Searching for board...");

    for (var i = 0; i < BOARD_SELS.length; i++) {
      var sel = BOARD_SELS[i];
      var el = document.querySelector(sel);
      if (!el) continue;

      var root = el.shadowRoot || el;
      var pieces = root.querySelectorAll(".piece, [class*='piece ']");
      if (pieces.length === 0) continue;

      log("  Candidate:", sel, el.tagName, pieces.length, "pieces");

      // Find the actual board grid: the direct parent of piece elements
      // This gives us the element with correct dimensions for coordinate calc
      var grid = findGrid(root, el);
      if (grid) {
        log("  Grid found:", grid.tagName, grid.className.substring(0, 60));
        return { el: el, root: root, grid: grid };
      }

      // Fallback: use the container itself
      return { el: el, root: root, grid: el };
    }

    // Fallback: search for piece elements directly
    var allPieces = document.querySelectorAll(
      "[class*='piece'][class*='square-']"
    );
    if (allPieces.length >= 2) {
      var parent = allPieces[0].parentElement;
      log("  Fallback via pieces:", allPieces.length, "parent:", parent.tagName);
      return { el: parent, root: parent, grid: parent };
    }

    log("  No board found.");
    return null;
  }

  // Find the grid element (the direct parent of .piece elements)
  function findGrid(root, container) {
    var piece = root.querySelector(".piece.square-11, .piece.square-88, .piece.square-18, .piece.square-81, .piece");
    if (!piece) return null;

    var parent = piece.parentElement;
    // Walk up from the piece's parent to find the best grid element
    // The grid should be roughly square and contain multiple pieces
    var candidate = parent;
    for (var depth = 0; depth < 4 && candidate && candidate !== container.parentElement; depth++) {
      var rect = candidate.getBoundingClientRect();
      var isSquare = Math.abs(rect.width - rect.height) < rect.width * 0.15;
      var pieceCount = candidate.querySelectorAll(".piece").length;

      if (isSquare && pieceCount >= 16) {
        return candidate;
      }
      candidate = candidate.parentElement;
    }

    // If no square element found, return the direct parent of pieces
    return parent;
  }

  // ============================================
  //  Engine
  // ============================================
  function getEngine(board, turn) {
    var fen = buildFen(board, turn);
    if (fen === S.engineFen && S.engine) return S.engine;
    try {
      S.engine = new Chess(fen);
      S.engineFen = fen;
      return S.engine;
    } catch (e) {
      log("FEN error:", fen);
      return null;
    }
  }

  function buildFen(board, turn) {
    var fen = "";
    for (var r = 0; r < 8; r++) {
      var empty = 0;
      for (var c = 0; c < 8; c++) {
        var p = board[r][c];
        if (p) {
          if (empty) { fen += empty; empty = 0; }
          fen += p[0] === "w" ? p[1].toUpperCase() : p[1].toLowerCase();
        } else empty++;
      }
      if (empty) fen += empty;
      if (r < 7) fen += "/";
    }
    fen += " " + turn;
    var cas = "";
    if (board[7][4] === "wk" && board[7][7] === "wr") cas += "K";
    if (board[7][4] === "wk" && board[7][0] === "wr") cas += "Q";
    if (board[0][4] === "bk" && board[0][7] === "br") cas += "k";
    if (board[0][4] === "bk" && board[0][0] === "br") cas += "q";
    return fen + " " + (cas || "-") + " - 0 1";
  }

  // ============================================
  //  Board parsing
  // ============================================
  function parseBoard() {
    if (!S.boardRoot) return null;
    var board = [];
    for (var i = 0; i < 8; i++) board.push([null,null,null,null,null,null,null,null]);

    var pieces = S.boardRoot.querySelectorAll(".piece");
    for (var i = 0; i < pieces.length; i++) {
      var cls = pieces[i].className;
      var sq = cls.match(/square-(\d)(\d)/);
      var pc = cls.match(/\b([wb])([pnbrqk])\b/);
      if (sq && pc) board[8 - parseInt(sq[2])][parseInt(sq[1]) - 1] = pc[1] + pc[2];
    }
    return board;
  }

  function detectFlip() {
    var a = S.boardRoot ? S.boardRoot.querySelector(".square-11") : null;
    var b = S.boardRoot ? S.boardRoot.querySelector(".square-88") : null;
    if (a && b) return a.getBoundingClientRect().top < b.getBoundingClientRect().top;
    return false;
  }

  function detectTurn() {
    var el = document.querySelector(
      '[class*="turn-indicator"],[data-whose-turn],[class*="whose-turn"]'
    );
    if (el && /black/i.test(el.className + (el.textContent || ""))) return "b";
    return "w";
  }

  // ============================================
  //  Coordinate: click position -> square
  //  Uses S.boardGrid for accurate calculation
  // ============================================
  function clickToSquare(e) {
    var grid = S.boardGrid;
    if (!grid) return null;
    var rect = grid.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    var sz = rect.width / 8;
    var c = Math.floor(x / sz);
    var r = Math.floor(y / sz);
    if (S.flipped) { c = 7 - c; r = 7 - r; }
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;

    return FILES[c] + (8 - r);
  }

  // ============================================
  //  Overlay (positioned on boardGrid)
  // ============================================
  function ensureOverlay() {
    if (S.overlay && S.overlay.isConnected) return true;
    // Overlay attaches to boardEl (the container with position:relative)
    // But coordinates are calculated from boardGrid
    var attachTo = S.boardEl;
    if (!attachTo) return false;
    var pos = getComputedStyle(attachTo).position;
    if (pos === "static") attachTo.style.position = "relative";
    S.overlay = document.createElement("div");
    S.overlay.className = "chess-move-helper-container";
    attachTo.appendChild(S.overlay);
    return true;
  }

  function getDiv() {
    if (S.poolN < S.pool.length) {
      var d = S.pool[S.poolN++];
      d.style.cssText = "";
      d.className = "";
      d.style.display = "block";
      return d;
    }
    var d = document.createElement("div");
    S.overlay.appendChild(d);
    S.pool.push(d);
    S.poolN++;
    return d;
  }

  function clearOverlay() {
    for (var i = 0; i < S.pool.length; i++) S.pool[i].style.display = "none";
    S.poolN = 0;
    hideMatePanel();
  }

  // Square position relative to boardGrid, mapped into overlay's coordinate space
  function sqPos(sq) {
    var c = FILES.indexOf(sq[0]);
    var r = parseInt(sq[1]);
    var gridRect = S.boardGrid.getBoundingClientRect();
    var elRect = S.boardEl.getBoundingClientRect();
    var sz = gridRect.width / 8;
    var vc = c, vr = 8 - r;
    if (S.flipped) { vc = 7 - vc; vr = 7 - vr; }
    // Position relative to boardEl (where overlay is attached)
    var x = (gridRect.left - elRect.left) + vc * sz;
    var y = (gridRect.top - elRect.top) + vr * sz;
    return { x: x, y: y, sz: sz };
  }

  // ============================================
  //  Mate analysis
  // ============================================
  function findMates(board, turn, square) {
    var eng = getEngine(board, turn);
    if (!eng) return null;
    var moves = eng.moves({ square: square, verbose: true });
    if (!moves.length) return null;

    var m1 = [], m2 = [], m1S = {};

    for (var i = 0; i < moves.length; i++) {
      eng.move(moves[i].san);
      if (eng.in_checkmate()) { m1.push(moves[i]); m1S[moves[i].to] = true; }
      eng.undo();
    }

    for (var i = 0; i < moves.length; i++) {
      if (m1S[moves[i].to]) continue;
      eng.move(moves[i].san);
      var opps = eng.moves({ verbose: true });
      if (!opps.length || opps.length > 25) { eng.undo(); continue; }
      var allMate = true;
      for (var j = 0; j < opps.length; j++) {
        eng.move(opps[j].san);
        var ours = eng.moves({ verbose: true });
        var found = false;
        for (var k = 0; k < ours.length; k++) {
          eng.move(ours[k].san);
          if (eng.in_checkmate()) found = true;
          eng.undo();
          if (found) break;
        }
        eng.undo();
        if (!found) { allMate = false; break; }
      }
      eng.undo();
      if (allMate) m2.push(moves[i]);
    }

    return (m1.length || m2.length) ? { m1: m1, m2: m2 } : null;
  }

  // ============================================
  //  Render
  // ============================================
  function render(square, moves, mates) {
    if (!ensureOverlay()) return;
    clearOverlay();

    var m1S = {}, m2S = {};
    if (mates) {
      for (var i = 0; i < mates.m1.length; i++) m1S[mates.m1[i].to] = true;
      for (var i = 0; i < mates.m2.length; i++) m2S[mates.m2[i].to] = true;
    }

    if (square) {
      var p = sqPos(square);
      var d = getDiv();
      d.className = "chess-mh-selected";
      d.style.cssText = "left:"+p.x+"px;top:"+p.y+"px;width:"+p.sz+"px;height:"+p.sz+"px";
    }

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var p = sqPos(m.to);
      var cap = !!m.captured;
      var d = getDiv();

      if (m1S[m.to]) {
        d.className = cap ? "chess-mh-mate1-capture" : "chess-mh-mate1";
      } else if (m2S[m.to]) {
        d.className = cap ? "chess-mh-mate2-capture" : "chess-mh-mate2";
      } else {
        d.className = cap ? "chess-mh-capture" : "chess-mh-dot";
        if (m.flags && (m.flags.indexOf("k") >= 0 || m.flags.indexOf("q") >= 0)) d.className = "chess-mh-castle";
        if (m.flags && m.flags.indexOf("e") >= 0) d.className = "chess-mh-enpassant";
      }

      if (cap || m1S[m.to] || (m2S[m.to] && cap)) {
        d.style.cssText = "left:"+p.x+"px;top:"+p.y+"px;width:"+p.sz+"px;height:"+p.sz+"px";
      } else {
        var ds = p.sz * (m1S[m.to] ? 0.34 : m2S[m.to] ? 0.32 : 0.28);
        d.style.cssText = "left:"+(p.x+(p.sz-ds)/2)+"px;top:"+(p.y+(p.sz-ds)/2)+"px;width:"+ds+"px;height:"+ds+"px;border-radius:50%";
      }
    }

    for (var i = S.poolN; i < S.pool.length; i++) S.pool[i].style.display = "none";
    if (mates) showMatePanel(mates);
  }

  // ============================================
  //  Mate panel
  // ============================================
  function hideMatePanel() {
    if (S.matePanel) S.matePanel.style.display = "none";
  }

  function showMatePanel(mates) {
    if (!S.matePanel) {
      S.matePanel = document.createElement("div");
      S.matePanel.className = "chess-mh-mate-panel";
      document.body.appendChild(S.matePanel);
    }
    var h = '<span class="close-btn" id="cmh-close">✕</span><h3>♚ 将杀路线</h3>';
    for (var i = 0; i < mates.m1.length; i++) {
      h += '<div style="margin:6px 0"><span class="mate-depth">将杀 1步</span>';
      h += '<div class="mate-path"><span class="move-us">① ' + mates.m1[i].san + '</span> → 将杀！</div></div>';
    }
    for (var i = 0; i < mates.m2.length; i++) {
      h += '<div style="margin:6px 0"><span class="mate-depth">将杀 2步</span>';
      h += '<div class="mate-path"><span class="move-us">① ' + mates.m2[i].san + '</span> → 对方任意 → ② 将杀</div></div>';
    }
    S.matePanel.innerHTML = h;
    S.matePanel.style.display = "";
    var btn = document.getElementById("cmh-close");
    if (btn) btn.onclick = hideMatePanel;
  }

  // ============================================
  //  Click handler
  // ============================================
  function handleClick(e) {
    if (!S.boardGrid) return;

    var sq = clickToSquare(e);
    if (!sq) return;

    var board = parseBoard();
    if (!board) return;
    var c = FILES.indexOf(sq[0]);
    var r = 8 - parseInt(sq[1]);
    var piece = board[r][c];

    if (S.selected === sq) {
      S.selected = null;
      clearOverlay();
      return;
    }

    if (S.selected && S.engine) {
      var legal = S.engine.moves({ square: S.selected, verbose: true });
      for (var i = 0; i < legal.length; i++) {
        if (legal[i].to === sq) {
          S.selected = null;
          clearOverlay();
          return;
        }
      }
    }

    if (piece) {
      S.selected = sq;
      var turn = detectTurn();
      var eng = getEngine(board, turn);
      if (!eng) return;
      var moves = eng.moves({ square: sq, verbose: true });
      if (!moves.length) { clearOverlay(); return; }
      render(sq, moves, null);

      clearTimeout(S._mateTimer);
      var capBoard = board;
      S._mateTimer = setTimeout(function() {
        if (S.selected !== sq) return;
        var mates = findMates(capBoard, turn, sq);
        if (S.selected === sq) render(sq, moves, mates);
      }, 50);
    } else {
      S.selected = null;
      clearOverlay();
    }
  }

  // ============================================
  //  MutationObserver
  // ============================================
  function onBoardChange() {
    clearTimeout(S._obsTimer);
    S._obsTimer = setTimeout(function() {
      S.flipped = detectFlip();
      if (!S.selected) return;
      var board = parseBoard();
      if (!board) return;
      var c = FILES.indexOf(S.selected[0]);
      var r = 8 - parseInt(S.selected[1]);
      if (!board[r][c]) {
        S.selected = null;
        clearOverlay();
        return;
      }
      var turn = detectTurn();
      var eng = getEngine(board, turn);
      if (!eng) return;
      var moves = eng.moves({ square: S.selected, verbose: true });
      if (!moves.length) { S.selected = null; clearOverlay(); return; }
      render(S.selected, moves, null);
      clearTimeout(S._mateTimer);
      var capBoard = board;
      S._mateTimer = setTimeout(function() {
        if (!S.selected) return;
        var mates = findMates(capBoard, turn, S.selected);
        if (S.selected) render(S.selected, moves, mates);
      }, 50);
    }, 200);
  }

  // ============================================
  //  Info / Keyboard
  // ============================================
  function showInfo(msg) {
    if (!S.infoEl) {
      S.infoEl = document.createElement("div");
      S.infoEl.className = "chess-mh-info";
      document.body.appendChild(S.infoEl);
    }
    S.infoEl.textContent = msg;
    S.infoEl.classList.add("visible");
    clearTimeout(S._infoTimer);
    S._infoTimer = setTimeout(function() { S.infoEl.classList.remove("visible"); }, 2000);
  }

  function onKey(e) {
    if (e.ctrlKey && e.shiftKey && e.key === "D") {
      e.preventDefault();
      diagnosticDump();
    }
  }

  function diagnosticDump() {
    log("=== DIAGNOSTIC ===");
    log("URL:", location.href);
    log("boardEl:", S.boardEl ? S.boardEl.tagName + "." + (S.boardEl.className||"").substring(0,40) : null);
    log("boardGrid:", S.boardGrid ? S.boardGrid.tagName + "." + (S.boardGrid.className||"").substring(0,40) : null);
    log("boardRoot pieces:", S.boardRoot ? S.boardRoot.querySelectorAll(".piece").length : 0);

    if (S.boardGrid) {
      var gr = S.boardGrid.getBoundingClientRect();
      log("Grid rect:", Math.round(gr.width)+"x"+Math.round(gr.height), "at", Math.round(gr.left)+","+Math.round(gr.top));
      var sq = gr.width / 8;
      log("Square size:", Math.round(sq));
    }

    for (var i = 0; i < BOARD_SELS.length; i++) {
      var el = document.querySelector(BOARD_SELS[i]);
      if (el) {
        var pc = el.querySelectorAll(".piece").length;
        var sr = el.shadowRoot ? " [shadow]" : "";
        var r = el.getBoundingClientRect();
        log("  " + BOARD_SELS[i] + " -> " + el.tagName + sr + " " + pc + "p " + Math.round(r.width)+"x"+Math.round(r.height));
      }
    }

    var pieces = document.querySelectorAll(".piece");
    if (pieces.length > 0) log("First piece class:", pieces[0].className);
    if (pieces.length > 0) log("First piece parent:", pieces[0].parentElement.tagName + "." + (pieces[0].parentElement.className||"").substring(0,40));

    showInfo("诊断已输出 (F12 控制台)");
    setStatus("诊断完成", "#1976D2");
  }

  // ============================================
  //  Destroy / Init
  // ============================================
  function destroy() {
    clearTimeout(S._obsTimer);
    clearTimeout(S._mateTimer);
    clearTimeout(S._infoTimer);
    if (S._boardObs) { S._boardObs.disconnect(); S._boardObs = null; }
    if (S._bodyObs) { S._bodyObs.disconnect(); S._bodyObs = null; }
    if (S.boardEl && S._clickFn) S.boardEl.removeEventListener("click", S._clickFn, true);
    document.removeEventListener("keydown", S._keyFn);
    if (S.overlay) { S.overlay.remove(); S.overlay = null; }
    if (S.matePanel) { S.matePanel.remove(); S.matePanel = null; }
    if (S.infoEl) { S.infoEl.remove(); S.infoEl = null; }
    S.pool.length = 0; S.poolN = 0;
    S.selected = null; S.engine = null; S.engineFen = "";
    S.boardEl = null; S.boardGrid = null; S.boardRoot = null;
    S._clickFn = null; S._keyFn = null; S._retryCount = 0;
  }

  function init() {
    destroy();
    var found = findBoard();
    if (!found) {
      S._retryCount++;
      if (S._retryCount <= 30) { setTimeout(init, 1000); }
      else { setStatus("未找到棋盘 - Ctrl+Shift+D 诊断", "#D32F2F"); setupBodyObs(); }
      return;
    }

    S.boardEl = found.el;
    S.boardRoot = found.root;
    S.boardGrid = found.grid;
    S.flipped = detectFlip();
    ensureOverlay();

    S._clickFn = handleClick;
    S.boardEl.addEventListener("click", handleClick, true);

    S._keyFn = onKey;
    document.addEventListener("keydown", onKey);

    S._boardObs = new MutationObserver(onBoardChange);
    S._boardObs.observe(S.boardRoot, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["class"],
    });

    var pc = S.boardRoot.querySelectorAll(".piece").length;
    var gw = Math.round(S.boardGrid.getBoundingClientRect().width);
    log("Ready! pieces:", pc, "grid:", gw+"px");
    setStatus("♟ 就绪 (" + pc + "子, 格" + gw + "px)", "#2E7D32");
  }

  function setupBodyObs() {
    if (S._bodyObs) return;
    S._bodyObs = new MutationObserver(function() {
      if (findBoard()) { S._bodyObs.disconnect(); S._bodyObs = null; init(); }
    });
    S._bodyObs.observe(document.body, { childList: true, subtree: true });
  }

  var lastUrl = location.href;
  S._urlObs = new MutationObserver(function() {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(init, 500); }
  });

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
  S._urlObs.observe(document.body, { childList: true, subtree: true });
})();
