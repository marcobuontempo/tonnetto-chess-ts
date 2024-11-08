import { ChessEngineAPI } from '../engine/dist/engine.bundle.js'

const chessWorker = new Worker('chessWorker.js', { type: 'module' });
const gameElement = document.getElementById('game');
const settingsElement = document.getElementById('settings');
const gameOverElement = document.getElementById('game-over');

const state = {
  gameState: 'playing',                                               // the current game state (playing | 50-move | stalemate | checkmate) 
  selectedSquare: null,                                               // selected square <div> from onclick handler
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',    // FEN string
  playerColour: 'w',                                                  // the colour the player will use: 'w' or 'b'
  difficulty: 3,                                                      // the difficulty of the AI (i.e scales the depth): 1-5 (but not necessarily depth 1-5)
  pieceSet: 'open-chess-font',                                        // the piece set to use
  boardTheme: 'dark',                                                 // the board theme to use
}

settingsElement.addEventListener('submit', (e) => {
  e.preventDefault();

  const settingsForm = new FormData(e.target);
  const { playerColour, difficulty, fen, pieceSet, boardTheme } = Object.fromEntries(settingsForm.entries());

  if (playerColour) state.playerColour = playerColour;
  if (difficulty) state.difficulty = difficulty;
  if (fen) state.fen = fen;
  if (pieceSet) state.pieceSet = pieceSet;
  if (boardTheme) state.boardTheme = boardTheme;

  settingsElement.style.display = 'none';
  gameElement.style.display = 'block';
  renderBoard();

  if (state.playerColour === 'b') makeComputerMove();
})

const difficultyScale = {
  1: 2,
  2: 4,
  3: 5,
  4: 7,
  5: 10,
}

const getTurn = () => {
  return state.fen.split(' ')[1];
}

const transformFenToPositionArray = () => {
  const rows = state.fen.split(' ')[0].split('/');

  // map over each row to replace numbers with the corresponding number of '0's (empty squares)
  const boardArray = rows.map(row => {
    return row.replace(/\d/g, (match) => '0'.repeat(parseInt(match, 10)));
  });

  return boardArray.reverse();
};

const renderBoard = () => {
  const board = document.getElementById('chessboard');
  board.innerHTML = '';
  const position = transformFenToPositionArray();
  
  if (state.playerColour === 'b') board.classList.add('flip');
  
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']; // chess files (columns)
  for (let row = 8; row > 0; row--) { // rows 8 to 1
    for (let col = 0; col < 8; col++) {
      const square = document.createElement('div');
      square.classList.add('chess-square');

      // determine the color of the square based on row and column
      if ((row + col) % 2 === 0) {
        square.classList.add('white-square');
      } else {
        square.classList.add('black-square');
      }

      // set the coordinate as a data attribute (e.g., "a8", "b7")
      const coordinate = `${files[col]}${row}`;
      square.setAttribute('data-coordinate', coordinate);

      let pieceChar = position[row-1][col];
      
      if (pieceChar === '0') {
        // empty square, no action needed
      } else {
        // if it's a piece, add the image of the piece
        const piece = document.createElement('img');
        const pieceColour = pieceChar.toLowerCase() === pieceChar ? 'b' : 'w';
        piece.classList.add('chess-piece');
        if (state.playerColour === 'b') piece.classList.add('flip');
        piece.src = `./chess-pieces/${state.pieceSet}/${pieceColour}${pieceChar.toUpperCase()}.svg`;
        piece.setAttribute('data-piece-colour', pieceColour);
        square.appendChild(piece);
      }

      board.appendChild(square);
      // add click event listener for selecting a piece
      square.addEventListener('click', () => {
        handleSquareClick(square);
      });
    }
  }

  gameElement.style.display = 'none';  
  gameOverElement.style.display = 'block';
  switch (state.gameState) {
    case 'checkmate':
      const winner = getTurn() === 'w' ? 'BLACK': 'WHITE';
      gameOverElement.innerHTML =  winner + 'WINS (checkmate)';
      break;
    case 'stalemate':
      gameOverElement.innerHTML = 'DRAW (stalemate)';
      break;
    case '50-move':
      gameOverElement.innerHTML = 'DRAW (50-move rule)';
      break;
    case 'playing':
    default:
      gameElement.style.display = 'block';
      gameOverElement.style.display = 'none';
      break;
  }
};

const handleSquareClick = (square) => {
  if (getTurn() !== state.playerColour) return; // only allow moves if player's current turn

  const existingCoordinate = state.selectedSquare?.getAttribute('data-coordinate');
  const clickedCoordinate = square.getAttribute('data-coordinate');
  const piece = square.querySelector('.chess-piece');
  
  if (!state.selectedSquare && piece) {
    toggleSquareHighlight(square);
    state.selectedSquare = square;
  } else if (state.selectedSquare) {
    const move = `${existingCoordinate}${clickedCoordinate}`;
    if (isValidMove(move)) {
      makeMove(move);
      makeComputerMove();
    } else if (existingCoordinate === clickedCoordinate) {
      toggleSquareHighlight(square)
    } else if (piece?.getAttribute('data-piece-colour') === state.playerColour){
      toggleSquareHighlight(state.selectedSquare)
      toggleSquareHighlight(square)
      state.selectedSquare = square;
    } else {
      toggleSquareHighlight(state.selectedSquare)
      state.selectedSquare = null;
    }
  }
};

const toggleSquareHighlight = (square) => {
  square.classList.toggle('selected-square');
}

const isValidMove = (moveNotation) => {
  const engine = new ChessEngineAPI(state.fen);
  engine.applyMove(moveNotation);
  return !(engine.getFen().split(' ')[0] === state.fen.split(' ')[0]);
}

const makeMove = (moveNotation) => {
  const engine = new ChessEngineAPI(state.fen);
  
  // perform the move
  engine.applyMove(moveNotation); // call the engine to make the move
 
  // clear previous selection
  if (state.selectedSquare) {
    state.selectedSquare.classList.remove('selected-square');
  }
  state.selectedSquare = null; // deselect the square
 
  state.fen = engine.getFen();

  state.gameState = engine.isGameOver();

  renderBoard();
}

const makeComputerMove = () => {
  // send the board state to the worker for processing
  const message = {
    fen: state.fen,
    depth: difficultyScale[state.difficulty],
  }
  chessWorker.postMessage(JSON.stringify(message));

  // listen for the best move from the worker
  chessWorker.onmessage = function(event) {
    const bestMove = event.data;
    if (bestMove) {
      // update the board with the best move
      makeMove(bestMove);
    }
  };
}