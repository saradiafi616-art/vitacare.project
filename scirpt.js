const medicalFile = document.getElementById("medicalFile");
const fileName = document.getElementById("fileName");

medicalFile.addEventListener("change", function () {

  const file = this.files[0];

  if (!file) {
    fileName.textContent = "No file selected";
    return;
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    alert("Please upload a PDF file only.");
    this.value = "";
    fileName.textContent = "No file selected";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("Maximum file size is 5 MB.");
    this.value = "";
    fileName.textContent = "No file selected";
    return;
  }

  fileName.textContent = file.name;

});
// VitaCare – shared script (loaded on every page)

document.addEventListener("DOMContentLoaded", function () {

  // 1. Keep the footer year up to date
  var year = document.getElementById("year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // 2. Slideshow: pause the animation while the mouse is over it
  // or it has keyboard focus
  var slideshow = document.querySelector(".slideshow");

  if (slideshow) {
    var slides = slideshow.querySelectorAll(".slide");

    function setState(state) {
      slides.forEach(function (slide) {
        slide.style.animationPlayState = state;
      });
    }

    slideshow.addEventListener("mouseenter", function () {
      setState("paused");
    });

    slideshow.addEventListener("mouseleave", function () {
      setState("running");
    });

    slideshow.addEventListener("focus", function () {
      setState("paused");
    });

    slideshow.addEventListener("blur", function () {
      setState("running");
    });
  }

});
