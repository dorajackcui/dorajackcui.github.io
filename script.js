// add circular revealer
document.addEventListener("DOMContentLoaded", () => {
  const revealerNav = window.revealer({
    revealElementSelector: ".nav-js",
    options: {
      anchorSelector: ".nav-btn-js",
    },
  });

  const actionBtn = document.querySelector(".nav-btn-js");
  actionBtn.addEventListener("click", () => {
    if (!revealerNav.isRevealed()) {
      revealerNav.reveal();
      actionBtn.setAttribute("data-open", true);
    } else {
      revealerNav.hide();
      actionBtn.setAttribute("data-open", false);
    }
  });
});



function drawLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.strokeStyle = '#c5c0b2';
  context.lineWidth = 1;
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.closePath();
}

// let's draw something 
const canvas = document.querySelector("canvas")
const context = canvas.getContext('2d');
let x ;
let y ;

// add custom cursor
const cursor = document.querySelector(".cursor")
document.addEventListener ("mousemove", (event) => {  
  let mouseX = event.pageX
  let mouseY = event.pageY
  cursor.style.left = mouseX + 'px'
  cursor.style.top = mouseY + 'px'

  //draw line
  drawLine(context, x, y, event.pageX, event.pageY);
  x = event.pageX;
  y = event.pageY;
  
})

document.addEventListener('mousedown', (event) => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  x = event.pageX
  y = event.pageY
});



// responsive canvas
// window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", resizeCanvas);
// document.addEventListener("load", resizeCanvas)
function resizeCanvas() {
    let w = document.body.clientWidth
    let h = document.body.clientHeight
    console.log(w,h)
    canvas.width = w ;
    canvas.height = h ;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px' ;
}



