// VitaCare – appointment page script (form validation + appointment PDF + medical file check)

document.addEventListener("DOMContentLoaded", function () {
    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    var form = document.getElementById("appointment-form");
    if (!form) return;

    // On GitHub Pages there is no PHP: run in demo mode (the request is not saved anywhere)
    var DEMO_MODE = /github\.io$/.test(window.location.hostname);

    // value of the <option> => name shown in the PDF
    var names = {
        general: "General medicine",
        cardiology: "Cardiology",
        dermatology: "Dermatology",
        pediatrics: "Pediatrics",
        dentistry: "Dentistry",
        gynecology: "Gynecology",
        ophthalmology: "Ophthalmology",
        neurology: "Neurology",
        orthopedics: "Orthopedics",
        ent: "ENT",
        laboratory: "Medical Laboratory Tests",
        endocrinology: "Endocrinology",
        pulmonology: "Pulmonology"
    };

    var labels = {
        name: "Full name",
        phone: "Phone number",
        email: "Email",
        specialty: "Specialty",
        date: "Preferred date",
        time: "Preferred time",
        message: "Additional information"
    };

    var f = {
        name: document.getElementById("name"),
        phone: document.getElementById("phone"),
        email: document.getElementById("email"),
        specialty: document.getElementById("specialty"),
        date: document.getElementById("date"),
        time: document.getElementById("time"),
        message: document.getElementById("message")
    };

    // Drop fields that do not exist in the page, so a missing element can never break the script
    Object.keys(f).forEach(function (key) {
        if (!f[key]) delete f[key];
    });

    // These fields are needed for the page to work
    if (!f.name || !f.phone || !f.specialty || !f.date || !f.time) {
        console.error("Appointment form: a required field is missing (name, phone, specialty, date, time).");
        return;
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    var summary = document.getElementById("form-summary");
    if (!summary) {
        summary = document.createElement("div");
        summary.id = "form-summary";
        summary.className = "form-summary";
        summary.setAttribute("role", "alert");
        summary.style.cssText = "grid-column:1/-1;color:#b3261e;font-weight:600;margin-bottom:.5rem";
        form.insertBefore(summary, form.firstChild);
    }
    summary.style.display = "none";

    function showSummary(message) {
        summary.textContent = message;
        summary.classList.add("is-visible");
        summary.style.display = "block";
    }
    function hideSummary() {
        summary.classList.remove("is-visible");
        summary.style.display = "none";
    }

    var counter = document.getElementById("message-count");
    var MAX_DAYS_AHEAD = 90;
    var MAX_MESSAGE = 500;
    var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    var touched = {};

    // ---------- Date helpers ----------
    function toISO(d) {
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }
    function parseDate(v) {
        var p = v.split("-");
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    function startOfToday() {
        var t = new Date();
        t.setHours(0, 0, 0, 0);
        return t;
    }

    var maxDate = startOfToday();
    maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);
    f.date.min = toISO(new Date());
    f.date.max = toISO(maxDate);

    // Pre-select a specialty from the address: rendyvous.html?specialty=cardiology
    var wanted = new URLSearchParams(window.location.search).get("specialty");
    if (wanted && names[wanted]) f.specialty.value = wanted;

    // ---------- Time slots: Sun–Thu 08:00–17:00, Sat 08:00–12:00, Fri closed ----------
    function buildSlots() {
        f.time.innerHTML = "";

        if (!f.date.value) {
            f.time.disabled = true;
            f.time.add(new Option("Choose a date first", ""));
            return;
        }

        var day = parseDate(f.date.value).getDay();
        if (day === 5) {
            f.time.disabled = true;
            f.time.add(new Option("Closed on Fridays", ""));
            return;
        }

        var now = new Date();
        var isToday = toISO(now) === f.date.value;
        var nowMinutes = now.getHours() * 60 + now.getMinutes();
        var closing = day === 6 ? 12 * 60 : 17 * 60;
        var count = 0;

        f.time.add(new Option("Choose a time", ""));
        for (var m = 8 * 60; m + 30 <= closing; m += 30) {
            if (isToday && m <= nowMinutes + 30) continue; // no past slots today
            var label = String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
            f.time.add(new Option(label, label));
            count++;
        }

        if (count === 0) {
            f.time.innerHTML = "";
            f.time.disabled = true;
            f.time.add(new Option("No slots left today", ""));
            return;
        }
        f.time.disabled = false;
    }

    // ---------- Validators (return "" when valid, otherwise the error message) ----------
    var validators = {
        name: function (value) {
            var v = value.trim().replace(/\s+/g, " ");
            if (v === "") return "Please enter your full name.";
            if (v.length > 60) return "The name is too long (60 characters maximum).";
            if (!/^[\p{L}\p{M}][\p{L}\p{M}' ’-]*[\p{L}\p{M}]$/u.test(v)) return "Use letters only (no digits or symbols).";
            if (v.split(" ").length < 2) return "Please enter your first name and last name.";
            return "";
        },

        phone: function (value) {
            var v = value.replace(/[\s.\-()]/g, "");
            if (v === "") return "Please enter your phone number.";
            if (!/^\+?\d+$/.test(v)) return "Use digits only (an optional + is allowed at the start).";
            // Algerian numbers: mobile 05/06/07 + 8 digits, landline 02/03/04 + 7 digits, or the same with +213 / 00213
            if (!/^(?:\+213|00213|0)(?:[567]\d{8}|[234]\d{7})$/.test(v)) {
                return "Enter a valid Algerian number, for example 0555 12 34 56 or +213 555 12 34 56.";
            }
            return "";
        },

        email: function (value) {
            var v = value.trim();
            if (v === "") return ""; // optional
            if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return "Enter a valid email address, for example name@example.com.";
            return "";
        },

        specialty: function (value) {
            return names[value] ? "" : "Please choose a specialty.";
        },

        date: function (value) {
            if (value === "") return "Please choose a date.";
            var chosen = parseDate(value);
            if (isNaN(chosen.getTime())) return "This date is not valid.";
            if (chosen < startOfToday()) return "Please choose today or a later date.";
            if (chosen > maxDate) return "Appointments can be booked up to " + MAX_DAYS_AHEAD + " days in advance.";
            if (chosen.getDay() === 5) return "The clinic is closed on Fridays.";
            return "";
        },

        time: function (value) {
            if (value !== "") return "";
            return f.time.disabled ? "Please choose a valid date first." : "Please choose a time.";
        },

        message: function (value) {
            var v = value.trim();
            if (v.length > MAX_MESSAGE) return "The text is too long (" + MAX_MESSAGE + " characters maximum).";
            if (/<[^>]*>/.test(v)) return "Please do not use HTML tags.";
            return "";
        }
    };

    function setState(key, message) {
        var wrapper = f[key].closest(".form-field") || f[key].parentNode;
        var box = document.getElementById(key + "-error");
        var filled = f[key].value.trim() !== "";

        if (!box) { // create the error line if the page does not have one for this field
            box = document.createElement("span");
            box.id = key + "-error";
            box.className = "field-error";
            box.setAttribute("aria-live", "polite");
            wrapper.appendChild(box);
        }
        box.textContent = message;
        wrapper.classList.toggle("invalid", message !== "");
        wrapper.classList.toggle("valid", message === "" && filled);
        f[key].setAttribute("aria-invalid", message !== "" ? "true" : "false");
        if (message !== "") {
            f[key].setAttribute("aria-describedby", key + "-error");
        } else {
            f[key].removeAttribute("aria-describedby");
        }
        return message === "";
    }

    function validate(key) {
        return setState(key, validators[key](f[key].value));
    }

    // ---------- Live validation ----------
    // The first check happens when the visitor leaves the field; after that it updates while typing.
    Object.keys(f).forEach(function (key) {
        var eventName = (f[key].tagName === "SELECT" || f[key].type === "date") ? "change" : "input";

        f[key].addEventListener("blur", function () {
            touched[key] = true;
            validate(key);
        });

        f[key].addEventListener(eventName, function () {
            if (touched[key] || eventName === "change") {
                touched[key] = true;
                validate(key);
            }
        });
    });

    // Phone: remove characters that can never be part of a phone number
    f.phone.addEventListener("input", function () {
        var cleaned = f.phone.value.replace(/[^\d+\s.\-()]/g, "");
        if (cleaned !== f.phone.value) f.phone.value = cleaned;
    });

    // Date change: rebuild the time list
    f.date.addEventListener("change", function () {
        buildSlots();
        if (touched.time) validate("time");
    });

    // Character counter for the additional information field
    if (f.message && counter) {
        f.message.addEventListener("input", function () {
            var length = f.message.value.length;
            counter.textContent = length + " / " + MAX_MESSAGE;
            counter.classList.toggle("limit", length >= MAX_MESSAGE);
        });
    }

    buildSlots();
    if (f.specialty.value) validate("specialty");

    // ---------- Medical report (PDF upload): name + type + size check ----------
    var medicalFile = document.getElementById("medicalFile");
    var fileMessage = document.getElementById("fileMessage");
    var fileName = document.getElementById("fileName");

    function resetFile(message) {
        if (medicalFile) medicalFile.value = "";
        if (fileName) fileName.textContent = "No file selected";
        if (fileMessage) fileMessage.textContent = message || "";
    }

    function checkMedicalFile() {
        if (!medicalFile || !medicalFile.files || !medicalFile.files[0]) return true;
        var file = medicalFile.files[0];
        if (!file.name.toLowerCase().endsWith(".pdf")) {
            resetFile("Please upload a PDF file only.");
            return false;
        }
        if (file.size > MAX_FILE_SIZE) {
            resetFile("File size must not exceed 5 MB.");
            return false;
        }
        return true;
    }

    if (medicalFile) {
        medicalFile.addEventListener("change", function () {
            if (fileMessage) fileMessage.textContent = "";
            var file = medicalFile.files[0];
            if (!file) {
                if (fileName) fileName.textContent = "No file selected";
                return;
            }
            if (checkMedicalFile() && fileName) fileName.textContent = file.name;
        });
    }

    // ---------- Appointment PDF ----------
    // The page is drawn on a canvas (so Arabic and Latin text both work) and then placed in an A4 PDF.
    var lastAppointment = null;
    var pdfStatus = document.getElementById("pdf-status");

    function makeReference() {
        var d = new Date();
        var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
        return "VC-" + stamp + "-" + Math.floor(1000 + Math.random() * 9000);
    }

    function roundedRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    function wrapText(c, text, maxWidth) {
        var lines = [];
        String(text).split("\n").forEach(function (paragraph) {
            var line = "";
            paragraph.split(" ").forEach(function (word) {
                var test = line ? line + " " + word : word;
                if (c.measureText(test).width <= maxWidth) {
                    line = test;
                    return;
                }
                if (line) lines.push(line);
                // a very long word: cut it so it never leaves the page
                while (c.measureText(word).width > maxWidth) {
                    var i = word.length;
                    while (i > 1 && c.measureText(word.slice(0, i)).width > maxWidth) i--;
                    lines.push(word.slice(0, i));
                    word = word.slice(i);
                }
                line = word;
            });
            lines.push(line);
        });
        return lines;
    }

    function drawAppointmentPage(canvas, a) {
        var W = 794, H = 1123, S = 2; // A4 at 96 dpi, drawn at double resolution
        var BODY = '"Segoe UI", Arial, sans-serif';
        var HEAD = 'Georgia, "Times New Roman", serif';
        var blue = "#1d5fd6", blueDark = "#1549a8", ink = "#0b2545", soft = "#4a5d78", mint = "#e8f0ff";

        canvas.width = W * S;
        canvas.height = H * S;
        var c = canvas.getContext("2d");
        c.scale(S, S);
        c.textBaseline = "alphabetic";
        c.textAlign = "left";

        // Background + header band
        c.fillStyle = "#ffffff";
        c.fillRect(0, 0, W, H);
        c.fillStyle = blue;
        c.fillRect(0, 0, W, 128);
        c.fillStyle = "#ffffff";
        c.font = "bold 40px " + HEAD;
        c.fillText("VitaCare", 56, 70);
        c.font = "18px " + BODY;
        c.fillText("Multi-specialty medical clinic", 56, 100);

        // Title + reference
        c.fillStyle = ink;
        c.font = "bold 32px " + HEAD;
        c.fillText("Appointment request", 56, 190);
        c.fillStyle = soft;
        c.font = "18px " + BODY;
        c.fillText("Reference: " + a.ref, 56, 222);

        // Details box (measure first so the box fits the content)
        var rows = [["Patient", a.name], ["Phone", a.phone]];
        if (a.email) rows.push(["Email", a.email]);
        rows.push(["Specialty", a.specialty], ["Date", a.date], ["Time", a.time]);
        if (a.message) rows.push(["Notes", a.message]);
        if (a.file) rows.push(["Medical report", a.file]);

        c.font = "17px " + BODY;
        var LINE = 26;
        var measured = rows.map(function (r) {
            var lines = wrapText(c, r[1], 450);
            return { label: r[0], lines: lines, height: lines.length * LINE + 14 };
        });
        var total = measured.reduce(function (sum, r) { return sum + r.height; }, 0);

        var boxTop = 250, boxH = total + 36;
        c.fillStyle = mint;
        roundedRect(c, 48, boxTop, W - 96, boxH, 16);
        c.fill();

        var y = boxTop + 40;
        measured.forEach(function (r) {
            c.fillStyle = blueDark;
            c.font = "bold 17px " + BODY;
            c.fillText(r.label, 76, y);
            c.fillStyle = ink;
            c.font = "17px " + BODY;
            r.lines.forEach(function (line, i) { c.fillText(line, 230, y + i * LINE); });
            y += r.height;
        });

        // Notes
        y = boxTop + boxH + 56;
        c.fillStyle = blueDark;
        c.font = "bold 21px " + HEAD;
        c.fillText("Important", 56, y);
        c.fillStyle = soft;
        c.font = "16px " + BODY;
        [
            "• This is an appointment request. Our team will call you to confirm it.",
            "• Please bring your ID and previous medical reports.",
            "• Arrive 10 minutes early for a first visit."
        ].forEach(function (note, i) { c.fillText(note, 56, y + 34 + i * 28); });

        // Clinic information
        y += 34 + 3 * 28 + 34;
        c.fillStyle = blueDark;
        c.font = "bold 21px " + HEAD;
        c.fillText("Clinic information", 56, y);
        c.fillStyle = soft;
        c.font = "16px " + BODY;
        c.fillText("12 Independence Street, Barika, Batna, Algeria", 56, y + 34);
        c.fillText("Phone: +213 782408544", 56, y + 62);
        c.fillText("Sunday to Thursday 08:00 – 17:00 · Saturday 08:00 – 12:00 · Friday closed", 56, y + 90);

        // Footer
        c.strokeStyle = blue;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(56, 1040);
        c.lineTo(W - 56, 1040);
        c.stroke();
        c.fillStyle = soft;
        c.font = "14px " + BODY;
        c.fillText("Generated on " + new Date().toLocaleDateString("en-GB") + " · VitaCare", 56, 1070);
    }

    function setPdfStatus(message, isError) {
        if (!pdfStatus) {
            var holder = document.getElementById("confirmation");
            if (!holder) return;
            pdfStatus = document.createElement("p");
            pdfStatus.id = "pdf-status";
            pdfStatus.className = "pdf-status";
            pdfStatus.setAttribute("aria-live", "polite");
            holder.appendChild(pdfStatus);
        }
        pdfStatus.textContent = message;
        pdfStatus.classList.toggle("error", !!isError);
    }

    // Returns true when the file was created
    function downloadPdf() {
        var a = lastAppointment;
        if (!a) return false;

        if (!window.jspdf || !window.jspdf.jsPDF) {
            setPdfStatus("The PDF library was not found. Put jspdf.umd.min.js in the same folder as the page, or use the print dialog to save as PDF.", true);
            return false;
        }

        try {
            var canvas = document.createElement("canvas");
            drawAppointmentPage(canvas, a);

            var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
            doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);
            doc.save("VitaCare-appointment-" + a.ref + ".pdf");

            setPdfStatus("Your appointment PDF has been downloaded.", false);
            return true;
        } catch (error) {
            console.error("PDF error:", error);
            setPdfStatus("The PDF could not be created. Please try again or use the print dialog.", true);
            return false;
        }
    }

    var pdfLink = document.getElementById("download-pdf");
    if (pdfLink) {
        pdfLink.addEventListener("click", function (event) {
            event.preventDefault();
            if (!downloadPdf() && !(window.jspdf && window.jspdf.jsPDF)) {
                window.print(); // last resort: browser "Save as PDF"
            }
        });
    }

    // ---------- Submit ----------
    function showConfirmation(ref) {
        var cleanName = f.name.value.trim().replace(/\s+/g, " ");
        var readableDate = parseDate(f.date.value).toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
        });

        lastAppointment = {
            ref: ref,
            name: cleanName,
            phone: f.phone.value.trim(),
            email: f.email ? f.email.value.trim() : "",
            specialty: names[f.specialty.value],
            date: readableDate,
            time: f.time.value,
            message: f.message ? f.message.value.trim() : "",
            file: (medicalFile && medicalFile.files && medicalFile.files[0]) ? medicalFile.files[0].name : ""
        };

        try {
            setText("c-name", cleanName);
            setText("c-ref", ref);
            setText("c-specialty", lastAppointment.specialty);
            setText("c-date", readableDate);
            setText("c-time", lastAppointment.time);
            setText("c-phone", lastAppointment.phone);

            var box = document.getElementById("confirmation");
            var intro = document.querySelector(".appointment-card-intro");
            if (box) {
                form.style.display = "none";
                if (intro) intro.style.display = "none";
                box.classList.add("is-visible");
                box.style.display = "block";
                box.focus();
                box.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        } catch (error) {
            console.error("Confirmation error:", error);
        }

        downloadPdf(); // the PDF is created automatically after the request is saved
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        var order = ["name", "phone", "email", "specialty", "date", "time", "message"].filter(function (key) {
            return f[key];
        });
        var invalid = order.filter(function (key) {
            touched[key] = true;
            return !validate(key);
        });

        var fileOk = checkMedicalFile();

        if (invalid.length > 0 || !fileOk) {
            var parts = invalid.map(function (k) { return labels[k]; });
            if (!fileOk) parts.push("Medical report");
            var count = parts.length;
            showSummary("Please correct " + count + (count === 1 ? " field" : " fields") +
                " before sending: " + parts.join(", ") + ".");
            if (invalid.length > 0) f[invalid[0]].focus();
            return;
        }
        hideSummary();

        // Demo mode (GitHub Pages): no server, so show the confirmation directly
        if (DEMO_MODE) {
            showConfirmation(makeReference());
            return;
        }

        // Send the request to the server (PHP + MySQL)
        var button = form.querySelector('button[type="submit"]');
        var buttonText = button ? button.textContent : "";
        if (button) { button.disabled = true; button.textContent = "Sending..."; }

        fetch(form.getAttribute("action") || "appointment.php", {
            method: "POST",
            body: new FormData(form)
        })
            .then(function (response) {
                return response.json().catch(function () {
                    throw new Error("Unexpected server response.");
                });
            })
            .then(function (result) {
                if (!result.ok) throw new Error(result.error || "Server error.");
                showConfirmation(result.reference);
            })
            .catch(function (error) {
                showSummary(error.message || "Could not send your request. Please try again.");
            })
            .then(function () {
                if (button) { button.disabled = false; button.textContent = buttonText; }
            });
    });
});