# GRS Lookup Values Reference

This file documents standard lookup codes and multi-lingual labels (`si`, `ta`, `en`) used across the mobile app, web dashboard, reports, and database tables.

> **Note for Project Owner (B1):** The vocational qualification, vocational stream, and job lists below contain `TODO_OWNER` stand-ins until official lists are provided. The Education ladder is based on Appendix F (marked DRAFT).

---

## 1. Education Ladder (`category = 'education'`) — *Draft per Appendix F*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) | Notes |
| --- | --- | --- | --- | --- | --- |
| `EDU_NO_SCHOOL` | 10 | No schooling | පාසල් ගොස් නැත | பாடசாலை செல்லவில்லை | Draft |
| `EDU_GRADE_1_5` | 20 | Grade 1–5 | 1–5 ශ්‍රේණිය | தரம் 1–5 | Draft |
| `EDU_GRADE_6_10` | 30 | Grade 6–10 | 6–10 ශ්‍රේණිය | தரம் 6–10 | Draft |
| `EDU_OL_PASSED` | 40 | G.C.E. O/L passed | අ.පො.ස. සා/පෙ සමත් | க.பொ.த. சா/தர சித்தி | Draft |
| `EDU_AL_PASSED` | 50 | G.C.E. A/L passed | අ.පො.ස. උ/පෙ සමත් | க.பொ.த. உ/தர சித்தி | Draft |
| `EDU_CERT_DIPLOMA` | 60 | Certificate / Diploma | සහතිකපත්‍ර / ඩිප්ලෝමා | சான்றிதழ் / டிப்ளோமா | Draft |
| `EDU_HIGHER_DIPLOMA` | 70 | Higher Diploma | උසස් ඩිප්ලෝමා | உயர் டிப்ளோமா | Draft |
| `EDU_BACHELORS` | 80 | Bachelor's degree | ප්‍රථම උපාධිය | இளங்கலை பட்டம் | Draft |
| `EDU_POSTGRADUATE` | 90 | Postgraduate | පශ්චාත් උපාධිය | முதுகலை பட்டம் | Draft |

---

## 2. Highest Vocational Qualification (`category = 'vocational_qualification'`) — *Awaiting B1*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) | Notes |
| --- | --- | --- | --- | --- | --- |
| `VOC_NONE` | 10 | None | නැත | இல்லை | Baseline |
| `VOC_NVQ_1` | 20 | NVQ Level 1 | NVQ මට්ටම 1 | NVQ மட்டம் 1 | Baseline |
| `VOC_NVQ_2` | 30 | NVQ Level 2 | NVQ මට්ටම 2 | NVQ மட்டம் 2 | Baseline |
| `VOC_NVQ_3` | 40 | NVQ Level 3 | NVQ මට්ටම 3 | NVQ மட்டம் 3 | Baseline |
| `VOC_NVQ_4` | 50 | NVQ Level 4 | NVQ මට්ටම 4 | NVQ மட்டம் 4 | Baseline |
| `VOC_NVQ_5` | 60 | NVQ Level 5 (Diploma) | NVQ මට්ටම 5 (ඩිප්ලෝමා) | NVQ மட்டம் 5 (டிப்ளோமா) | Baseline |
| `VOC_NVQ_6` | 70 | NVQ Level 6 (Higher Diploma) | NVQ මට්ටම 6 (උසස් ඩිප්ලෝමා) | NVQ மட்டம் 6 (உயர் டிப்ளோமா) | Baseline |
| `VOC_NVQ_7` | 80 | NVQ Level 7 (Degree) | NVQ මට්ටම 7 (උපාධි) | NVQ மட்டம் 7 (பட்டம்) | Baseline |
| `VOC_OTHER` | 90 | Other Vocational Qualification | වෙනත් වෘත්තීය සුදුසුකම් | ஏனைய தொழிற்கல்வி தகைமை | Baseline |
| `TODO_OWNER_VOC_1` | 999 | Pending Owner Specification | අයිතිකරුගේ තහවුරු කිරීම අපේක්ෂිතයි | உரிமையாளரின் உறுதிப்படுத்தல் தேவை | Stand-in |

---

## 3. Interested Vocational Stream (`category = 'vocational_stream'`) — *Awaiting B1*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) | Notes |
| --- | --- | --- | --- | --- | --- |
| `STREAM_IT_COMPUTING` | 10 | Information Technology & Computing | තොරතුරු තාක්ෂණය සහ පරිගණක | தகவல் தொழில்நுட்பம் & கணிப்பொறி | Baseline |
| `STREAM_ELECTRICAL_ELECTRONIC` | 20 | Electrical, Electronics & Telecommunications | විදුලි, ඉලෙක්ට්‍රොනික හා විදුලි සංදේශ | மின், மின்னணு மற்றும் தொலைத்தொடர்பு | Baseline |
| `STREAM_MECHANICAL_AUTOMOBILE` | 30 | Automobile & Mechanical Engineering | මෝටර් රථ හා යාන්ත්‍රික ඉංජිනේරු | மோட்டார் மற்றும் இயந்திரவியல் | Baseline |
| `STREAM_BUILDING_CONSTRUCTION` | 40 | Construction & Woodwork | ගොඩනැගිලි ඉදිකිරීම් සහ වඩු කාර්මික | கட்டிட நிர்மாணம் மற்றும் தச்சு | Baseline |
| `STREAM_HOSPITALITY_TOURISM` | 50 | Tourism & Hospitality | සංචාරක සහ ආගන්තුක සත්කාර | சுற்றுலா மற்றும் விருந்தோம்பல் | Baseline |
| `STREAM_BEAUTY_HAIR` | 60 | Beauty Culture & Hair Dressing | රූපලාවණ්‍ය සහ කොණ්ඩා සැකසුම් | அழகுக்கலை மற்றும் சிகையலங்காரம் | Baseline |
| `STREAM_AGRICULTURE_FOOD` | 70 | Agriculture & Food Technology | කෘෂිකාර්මික හා ආහාර තාක්ෂණය | விவசாயம் மற்றும் உணவு தொழில்நுட்பம் | Baseline |
| `STREAM_APPAREL_GARMENT` | 80 | Textile & Garment Manufacturing | ඇඟලුම් හා රෙදිපිළි | ஆடை மற்றும் ஜவுளி | Baseline |
| `STREAM_HEALTHCARE_CARE` | 90 | Healthcare & Nursing Support | සෞඛ්‍ය සහ උපස්ථාන සේවා | சுகாதார மற்றும் பராமரிப்பு சேவைகள் | Baseline |
| `STREAM_OTHER` | 100 | Other Stream | වෙනත් ක්ෂේත්‍රයක් | ஏனைய துறை | Baseline |
| `TODO_OWNER_STREAM_1` | 999 | Pending Owner Specification | අයිතිකරුගේ තහවුරු කිරීම අපේක්ෂිතයි | உரிமையாளரின் உறுதிப்படுத்தல் தேவை | Stand-in |

---

## 4. Interested Job (`category = 'job'`) — *Awaiting B1*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) | Notes |
| --- | --- | --- | --- | --- | --- |
| `JOB_SOFTWARE_DEV` | 10 | Software Developer / IT Technician | මෘදුකාංග සංවර්ධක / තොරතුරු තාක්ෂණ ශිල්පී | மென்பொருள் உருவாக்குநர் / IT தொழில்நுட்ப வல்லுநர் | Baseline |
| `JOB_ELECTRICIAN` | 20 | Electrician / Wireman | විදුලි කාර්මික | மின்சார தொழில்நுட்பவியலாளர் | Baseline |
| `JOB_MECHANIC` | 30 | Auto Mechanic | මෝටර් රථ කාර්මික | மோட்டார் மெக்கானிக் | Baseline |
| `JOB_PLUMBER` | 40 | Plumber | ජලනල කාර්මික | குழாய் பொருத்துனர் | Baseline |
| `JOB_CARPENTER` | 50 | Carpenter / Mason | වඩු / පෙදරේරු කාර්මික | தச்சர் / கொத்தனார் | Baseline |
| `JOB_CHEF_COOK` | 60 | Chef / Cook | ප්‍රධාන සූපවේදී / කෝකි | சமையல் கலைஞர் / சமையல்காரர் | Baseline |
| `JOB_BEAUTICIAN` | 70 | Beautician / Hair Stylist | රූපලාවණ්‍ය ශිල්පී | அழகுக்கலைஞர் / முடி திருத்துனர் | Baseline |
| `JOB_NURSE_CAREGIVER` | 80 | Nursing Assistant / Caregiver | හෙද සහායක / උපස්ථායක | தாதி உதவியாளர் / பராமரிப்பாளர் | Baseline |
| `JOB_CLERICAL_ADMIN` | 90 | Office Clerk / Data Entry | කාර්යාල ලිපිකරු / දත්ත ඇතුලත් කිරීමේ ශිල්පී | அலுவலக எழுத்தர் / தரவு உள்ளீட்டாளர் | Baseline |
| `JOB_SALES_MARKETING` | 100 | Sales & Marketing Representative | අලෙවි නියෝජිත | விற்பனை பிரதிநிதி | Baseline |
| `JOB_OTHER` | 110 | Other Job | වෙනත් රැකියාවක් | ஏனைய தொழில் | Baseline |
| `TODO_OWNER_JOB_1` | 999 | Pending Owner Specification | අයිතිකරුගේ තහවුරු කිරීම අපේක්ෂිතයි | உரிமையாளரின் உறுதிப்படுத்தல் தேவை | Stand-in |

---

## 5. Future Hopes (`category = 'future_hope'`) — *DD/S/001 Item 10.12*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) |
| --- | --- | --- | --- | --- |
| `higher_education` | 10 | Higher Education | උසස් අධ්‍යාපනය | உயர் கல்வி |
| `vocational_education` | 20 | Vocational Education | වෘත්තීය අධ්‍යාපනය | தொழிற்கல்வி |
| `entrepreneur` | 30 | Entrepreneurship / Self-employment | ව්‍යවසායකත්වය / ස්වයං රැකියා | தொழில்முனைவு / சுயதொழில் |
| `local_job` | 40 | Local Job | දේශීය රැකියාවක් | உள்நாட்டு வேலை |
| `foreign_job` | 50 | Foreign Job | විදේශ රැකියාවක් | வெளிநாட்டு வேலை |

---

## 6. Information Provided By (`category = 'info_provided_by'`) — *DD/S/001 Item 10.13*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) |
| --- | --- | --- | --- | --- |
| `self` | 10 | Self | තමාම | தானே |
| `mother` | 20 | Mother | මව | தாய் |
| `father` | 30 | Father | පියා | தந்தை |
| `sister` | 40 | Sister | සහෝදරිය | சகோதரி |
| `other` | 50 | Other (specify) | වෙනත් (සඳහන් කරන්න) | ஏனையோர் (குறிப்பிடவும்) |
