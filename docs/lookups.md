# GRS Lookup Values Reference

This file documents standard lookup codes and multi-lingual labels (`si`, `ta`, `en`) used across the mobile app, web dashboard, reports, and database tables.

> **Note for Project Owner (B1) — DEMO SEED NOTICE:**
> Zero `TODO_OWNER` placeholders remain in the active canonical dataset (all placeholder tests pass with zero `TODO_OWNER` rows).
> However, the vocational qualification, vocational stream, and job lists below are **agent-invented baseline demo lists** with unreviewed Sinhala and Tamil labels.
> **Action required before pilot:** Replace these demo lists with your official project owner lists before the pilot starts. Once survey data is collected, these lookup codes become permanent keys and changing them later will require database migrations.
> Until replaced, this seed dataset is explicitly marked as **DEMO SEED**. The Education ladder is based on Appendix F (marked DRAFT).

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

## 2. Highest Vocational Qualification (`category = 'vocational_qualification'`) — *Demo Seed (Awaiting B1)*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) | Notes |
| --- | --- | --- | --- | --- | --- |
| `VOC_NONE` | 10 | None | නැත | இல்லை | Demo Seed |
| `VOC_NVQ_1` | 20 | NVQ Level 1 | NVQ මට්ටම 1 | NVQ மட்டம் 1 | Demo Seed |
| `VOC_NVQ_2` | 30 | NVQ Level 2 | NVQ මට්ටම 2 | NVQ மட்டம் 2 | Demo Seed |
| `VOC_NVQ_3` | 40 | NVQ Level 3 | NVQ මට්ටම 3 | NVQ மட்டம் 3 | Demo Seed |
| `VOC_NVQ_4` | 50 | NVQ Level 4 | NVQ මට්ටම 4 | NVQ மட்டம் 4 | Demo Seed |
| `VOC_NVQ_5` | 60 | NVQ Level 5 (Diploma) | NVQ මට්ටම 5 (ඩිප්ලෝමා) | NVQ மட்டம் 5 (டிப்ளோமா) | Demo Seed |
| `VOC_NVQ_6` | 70 | NVQ Level 6 (Higher Diploma) | NVQ මට්ටම 6 (උසස් ඩිප්ලෝමා) | NVQ மட்டம் 6 (உயர் டிப்ளோமா) | Demo Seed |
| `VOC_NVQ_7` | 80 | NVQ Level 7 (Degree) | NVQ මට්ටම 7 (උපාධි) | NVQ மட்டம் 7 (பட்டம்) | Demo Seed |
| `VOC_OTHER` | 90 | Other Vocational Qualification | වෙනත් වෘත්තීය සුදුසුකම් | ஏனைய தொழிற்கல்வி தகைமை | Demo Seed |

---

## 3. Interested Vocational Stream (`category = 'vocational_stream'`) — *NIE / Ministry of Skills Development 16 Vocational Streams*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) | Notes |
| --- | --- | --- | --- | --- | --- |
| `STREAM_AGRICULTURE_FOOD_NATURAL` | 10 | Agriculture, Food and Natural Resource Sector | කෘෂිකර්ම ආහාර හා ස්වාභාවික සම්පත් ක්ෂේත්‍රය | விவசாயம், உணவு மற்றும் இயற்கை வளங்கள் துறை | Official Stream 1 |
| `STREAM_ARCHITECTURE_CONSTRUCTION` | 20 | Architecture and Construction Sector | ගෘහ නිර්මාණ හා ඉදිකිරීම් ක්ෂේත්‍රය | கட்டிடக்கலை மற்றும் நிர்மாணத்துறை | Official Stream 2 |
| `STREAM_ARTS_AUDIO_VIDEO_COMMUNICATION` | 30 | Arts, Audio/ Video Technology and Communication Sector | කලා, ශ්‍රව්‍ය/ දෘශ්‍ය වීඩියෝ තාක්ෂණය, සහ සන්නිවේදන ක්ෂේත්‍රය | கலைகள், ஒலி/ஒளி தொழில்நுட்பம் மற்றும் தொடர்பாடல் துறை | Official Stream 3 |
| `STREAM_HEALTH_SCIENCE` | 40 | Health Science Sector | සෞඛ්‍ය විද්‍යා ක්ෂේත්‍රය | சுகாதார விஞ்ஞானத்துறை | Official Stream 4 |
| `STREAM_HOSPITALITY_TOURISM` | 50 | Hospitality and Tourism Sector | ආගන්තුක සත්කාර සහ සංචාරක ක්ෂේත්‍රය | விருந்தோம்பல் மற்றும் சுற்றுலாத்துறை | Official Stream 5 |
| `STREAM_IT` | 60 | Information Technology IT - Sector | තොරතුරු තාක්ෂණ ක්ෂේත්‍රය | தகவல் தொழில்நுட்பத்துறை | Official Stream 6 |
| `STREAM_LAW_PUBLIC_SAFETY_SECURITY` | 70 | Law, Public Safety and Security Sector | නීතිය හා මහජන ආරක්ෂා ක්ෂේත්‍රය | சட்டம், பொதுப் பாதுகாப்பு மற்றும் பாதுகாப்புத்துறை | Official Stream 7 |
| `STREAM_MANUFACTURING` | 80 | Manufacturing Sector | නිෂ්පාදන ක්ෂේත්‍රය | உற்பத்தித்துறை | Official Stream 8 |
| `STREAM_STEM` | 90 | Science, Technology, Engineering and Mathematics (STEM) Sector | විද්‍යාව, තාක්ෂණය, ඉංජිනේරු විද්‍යාව සහ ගණිත (STEM) ක්ෂේත්‍රය | விஞ்ஞானம், தொழில்நுட்பம், பொறியியல் மற்றும் கணிதம் (STEM) துறை | Official Stream 9 |
| `STREAM_TRANSPORTATION_DISTRIBUTION_LOGISTICS` | 100 | Transportation, Distribution and Logistics Sector | ප්‍රවාහන, බෙදා හැරීම සහ සැපයුම් ක්ෂේත්‍රය | போக்குவரத்து, விநியோகம் மற்றும் தளவாடங்கள் துறை | Official Stream 10 |
| `STREAM_EDUCATION_TRAINING` | 110 | Education and Training Sector | අධ්‍යාපන සහ පුහුණු ක්ෂේත්‍රය | கல்வி மற்றும் பயிற்சித்துறை | Official Stream 11 |
| `STREAM_HUMAN_SERVICE` | 120 | Human Service Sector | මානව සේවා ක්ෂේත්‍රය | மனித சேவைத்துறை | Official Stream 12 |
| `STREAM_MARKETING_SALES_SERVICE` | 130 | Marketing, Sales, and Service Sector | අලෙවිකරණ, විකුණුම් සහ සේවා ක්ෂේත්‍රය | சந்தைப்படுத்தல், விற்பனை மற்றும் சேவைத்துறை | Official Stream 13 |
| `STREAM_GOVERNMENT_PUBLIC_ADMIN` | 140 | Government and Public Administration Sector | රාජ්‍ය සහ රාජ්‍ය පරිපාලන ක්ෂේත්‍රය | அரசு மற்றும் பொது நிர்வாகத்துறை | Official Stream 14 |
| `STREAM_BUSINESS_MGMT_ADMIN` | 150 | Business, Management and Administration Sector | ව්‍යාපාර කළමනාකරණ සහ පරිපාලන ක්ෂේත්‍රය | வணிகம், முகாமைத்துவம் மற்றும் நிர்வாகத்துறை | Official Stream 15 |
| `STREAM_FINANCE` | 160 | Finance Sector | මූල්‍ය ක්ෂේත්‍රය | நிதித்துறை | Official Stream 16 |
| `STREAM_OTHER` | 170 | Other Sector | වෙනත් ක්ෂේත්‍රය | ஏனைய துறை | Fallback Stream |

---

## 4. Interested Job (`category = 'job'`) — *Demo Seed (Awaiting B1)*

| Code | Sort | Label (English) | Label (Sinhala) | Label (Tamil) | Notes |
| --- | --- | --- | --- | --- | --- |
| `JOB_SOFTWARE_DEV` | 10 | Software Developer / IT Technician | මෘදුකාංග සංවර්ධක / තොරතුරු තාක්ෂණ ශිල්පී | மென்பொருள் உருவாக்குநர் / IT தொழில்நுட்ப வல்லுநர் | Demo Seed |
| `JOB_ELECTRICIAN` | 20 | Electrician / Wireman | විදුලි කාර්මික | மின்சார தொழில்நுட்பவியலாளர் | Demo Seed |
| `JOB_MECHANIC` | 30 | Auto Mechanic | මෝටර් රථ කාර්මික | மோட்டார் மெக்கானிக் | Demo Seed |
| `JOB_PLUMBER` | 40 | Plumber | ජලනල කාර්මික | குழாய் பொருத்துனர் | Demo Seed |
| `JOB_CARPENTER` | 50 | Carpenter / Mason | වඩු / පෙදරේරු කාර්මික | தச்சர் / கொத்தனார் | Demo Seed |
| `JOB_CHEF_COOK` | 60 | Chef / Cook | ප්‍රධාන සූපවේදී / කෝකි | சமையல் கலைஞர் / சமையல்காரர் | Demo Seed |
| `JOB_BEAUTICIAN` | 70 | Beautician / Hair Stylist | රූපලාවණ්‍ය ශිල්පී | அழகுக்கலைஞர் / முடி திருத்துனர் | Demo Seed |
| `JOB_NURSE_CAREGIVER` | 80 | Nursing Assistant / Caregiver | හෙද සහායක / උපස්ථායක | தாதி உதவியாளர் / பராமரிப்பாளர் | Demo Seed |
| `JOB_CLERICAL_ADMIN` | 90 | Office Clerk / Data Entry | කාර්යාල ලිපිකරු / දත්ත ඇතුලත් කිරීමේ ශිල්පී | அலுவலக எழுத்தர் / தரவு உள்ளீட்டாளர் | Demo Seed |
| `JOB_SALES_MARKETING` | 100 | Sales & Marketing Representative | අලෙවි නියෝජිත | விற்பனை பிரதிநிதி | Demo Seed |
| `JOB_OTHER` | 110 | Other Job | වෙනත් රැකියාවක් | ஏனைய தொழில் | Demo Seed |

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
