// Chess Engine - alpha-beta depth 3 + piece-square tables
var ChessEngine = (function () {
  "use strict";

  var V = { p:100, n:320, b:330, r:500, q:900, k:20000 };

  // PST from white's view: index 0=a8(top-left), 63=h1(bottom-right)
  var P = {
    p:[ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n:[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b:[-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r:[ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q:[-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k:[-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };

  function eval(chess) {
    var sc = 0, bd = chess.board();
    for (var r = 0; r < 8; r++)
      for (var c = 0; c < 8; c++) {
        var p = bd[r][c]; if (!p) continue;
        var idx = p.color === "w" ? (7-r)*8+c : r*8+c;
        sc += (p.color === "w" ? 1 : -1) * (V[p.type] + P[p.type][idx]);
      }
    return sc;
  }

  function order(moves) {
    for (var i = 0; i < moves.length; i++)
      moves[i]._s = moves[i].captured ? V[moves[i].captured]*10 - V[moves[i].piece] : 0;
    moves.sort(function(a,b){ return b._s - a._s; });
    return moves;
  }

  function ab(chess, depth, alpha, beta, maxing) {
    if (depth <= 0) return eval(chess);
    var moves = order(chess.moves({ verbose:true }));
    if (!moves.length) return chess.in_checkmate() ? (maxing ? -99999 : 99999) : 0;

    if (maxing) {
      var best = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        chess.move(moves[i].san);
        var v = ab(chess, depth-1, alpha, beta, false);
        chess.undo();
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (beta <= alpha) break;
      }
      return best;
    } else {
      var best = Infinity;
      for (var i = 0; i < moves.length; i++) {
        chess.move(moves[i].san);
        var v = ab(chess, depth-1, alpha, beta, true);
        chess.undo();
        if (v < best) best = v;
        if (v < beta) beta = v;
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function best(chess, depth) {
    depth = depth || 3;
    var isW = chess.turn() === "w";
    var moves = order(chess.moves({ verbose:true }));
    var bm = null, bv = isW ? -Infinity : Infinity;
    for (var i = 0; i < moves.length; i++) {
      chess.move(moves[i].san);
      var v = ab(chess, depth-1, -Infinity, Infinity, !isW);
      chess.undo();
      if (isW ? v > bv : v < bv) { bv = v; bm = moves[i]; }
    }
    return { move: bm, eval: bv };
  }

  return { best: best, eval: eval };
})();
