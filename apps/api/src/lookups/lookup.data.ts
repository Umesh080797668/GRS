export interface LookupItem {
  category: string;
  code: string;
  labelEn: string;
  labelSi: string;
  labelTa: string;
  sort: number;
  isActive?: boolean;
}

export const CANONICAL_LOOKUPS: LookupItem[] = [
  // 1. Education Ladder (Appendix F Draft)
  { category: 'education', code: 'EDU_NO_SCHOOL', sort: 10, labelEn: 'No schooling', labelSi: 'පාසල් ගොස් නැත', labelTa: 'பாடசாலை செல்லவில்லை' },
  { category: 'education', code: 'EDU_GRADE_1_5', sort: 20, labelEn: 'Grade 1–5', labelSi: '1–5 ශ්‍රේණිය', labelTa: 'தரம் 1–5' },
  { category: 'education', code: 'EDU_GRADE_6_10', sort: 30, labelEn: 'Grade 6–10', labelSi: '6–10 ශ්‍රේණිය', labelTa: 'தரம் 6–10' },
  { category: 'education', code: 'EDU_OL_PASSED', sort: 40, labelEn: 'G.C.E. O/L passed', labelSi: 'අ.පො.ස. සා/පෙ සමත්', labelTa: 'க.பொ.த. சா/தர சித்தி' },
  { category: 'education', code: 'EDU_AL_PASSED', sort: 50, labelEn: 'G.C.E. A/L passed', labelSi: 'අ.පො.ස. උ/පෙ සමත්', labelTa: 'க.பொ.த. உ/தர சித்தி' },
  { category: 'education', code: 'EDU_CERT_DIPLOMA', sort: 60, labelEn: 'Certificate / Diploma', labelSi: 'සහතිකපත්‍ර / ඩිප්ලෝමා', labelTa: 'சான்றிதழ் / டிப்ளோமா' },
  { category: 'education', code: 'EDU_HIGHER_DIPLOMA', sort: 70, labelEn: 'Higher Diploma', labelSi: 'උසස් ඩිප්ලෝමා', labelTa: 'உயர் டிப்ளோமா' },
  { category: 'education', code: 'EDU_BACHELORS', sort: 80, labelEn: "Bachelor's degree", labelSi: 'ප්‍රථම උපාධිය', labelTa: 'இளங்கலை பட்டம்' },
  { category: 'education', code: 'EDU_POSTGRADUATE', sort: 90, labelEn: 'Postgraduate', labelSi: 'පශ්චාත් උපාධිය', labelTa: 'முதுகலை பட்டம்' },

  // 2. Highest Vocational Qualification (Baseline per B1)
  { category: 'vocational_qualification', code: 'VOC_NONE', sort: 10, labelEn: 'None', labelSi: 'නැත', labelTa: 'இல்லை' },
  { category: 'vocational_qualification', code: 'VOC_NVQ_1', sort: 20, labelEn: 'NVQ Level 1', labelSi: 'NVQ මට්ටම 1', labelTa: 'NVQ மட்டம் 1' },
  { category: 'vocational_qualification', code: 'VOC_NVQ_2', sort: 30, labelEn: 'NVQ Level 2', labelSi: 'NVQ මට්ටම 2', labelTa: 'NVQ மட்டம் 2' },
  { category: 'vocational_qualification', code: 'VOC_NVQ_3', sort: 40, labelEn: 'NVQ Level 3', labelSi: 'NVQ මට්ටම 3', labelTa: 'NVQ மட்டம் 3' },
  { category: 'vocational_qualification', code: 'VOC_NVQ_4', sort: 50, labelEn: 'NVQ Level 4', labelSi: 'NVQ මට්ටම 4', labelTa: 'NVQ மட்டம் 4' },
  { category: 'vocational_qualification', code: 'VOC_NVQ_5', sort: 60, labelEn: 'NVQ Level 5 (Diploma)', labelSi: 'NVQ මට්ටම 5 (ඩිප්ලෝමා)', labelTa: 'NVQ மட்டம் 5 (டிப்ளோமா)' },
  { category: 'vocational_qualification', code: 'VOC_NVQ_6', sort: 70, labelEn: 'NVQ Level 6 (Higher Diploma)', labelSi: 'NVQ මට්ටම 6 (උසස් ඩිප්ලෝමා)', labelTa: 'NVQ மட்டம் 6 (உயர் டிப்ளோமா)' },
  { category: 'vocational_qualification', code: 'VOC_NVQ_7', sort: 80, labelEn: 'NVQ Level 7 (Degree)', labelSi: 'NVQ මට්ටම 7 (උපාධි)', labelTa: 'NVQ மட்டம் 7 (பட்டம்)' },
  { category: 'vocational_qualification', code: 'VOC_OTHER', sort: 90, labelEn: 'Other Vocational Qualification', labelSi: 'වෙනත් වෘත්තීය සුදුසුකම්', labelTa: 'ஏனைய தொழிற்கல்வி தகைமை' },
  { category: 'vocational_qualification', code: 'TODO_OWNER_VOC_1', sort: 999, labelEn: 'Pending Owner Specification', labelSi: 'අයිතිකරුගේ තහවුරු කිරීම අපේක්ෂිතයි', labelTa: 'உரிமையாளரின் உறுதிப்படுத்தல் தேவை' },

  // 3. Interested Vocational Stream (Baseline per B1)
  { category: 'vocational_stream', code: 'STREAM_IT_COMPUTING', sort: 10, labelEn: 'Information Technology & Computing', labelSi: 'තොරතුරු තාක්ෂණය සහ පරිගණක', labelTa: 'தகவல் தொழில்நுட்பம் & கணிப்பொறி' },
  { category: 'vocational_stream', code: 'STREAM_ELECTRICAL_ELECTRONIC', sort: 20, labelEn: 'Electrical, Electronics & Telecommunications', labelSi: 'විදුලි, ඉලෙක්ට්‍රොනික හා විදුලි සංදේශ', labelTa: 'மின், மின்னணு மற்றும் தொலைத்தொடர்பு' },
  { category: 'vocational_stream', code: 'STREAM_MECHANICAL_AUTOMOBILE', sort: 30, labelEn: 'Automobile & Mechanical Engineering', labelSi: 'මෝටර් රථ හා යාන්ත්‍රික ඉංජිනේරු', labelTa: 'மோட்டார் மற்றும் இயந்திரவியல்' },
  { category: 'vocational_stream', code: 'STREAM_BUILDING_CONSTRUCTION', sort: 40, labelEn: 'Construction & Woodwork', labelSi: 'ගොඩනැගිලි ඉදිකිරීම් සහ වඩු කාර්මික', labelTa: 'கட்டிட நிர்மாணம் மற்றும் தச்சு' },
  { category: 'vocational_stream', code: 'STREAM_HOSPITALITY_TOURISM', sort: 50, labelEn: 'Tourism & Hospitality', labelSi: 'සංචාරක සහ ආගන්තුක සත්කාර', labelTa: 'சுற்றுலா மற்றும் விருந்தோம்பல்' },
  { category: 'vocational_stream', code: 'STREAM_BEAUTY_HAIR', sort: 60, labelEn: 'Beauty Culture & Hair Dressing', labelSi: 'රූපලාවණ්‍ය සහ කොණ්ඩා සැකසුම්', labelTa: 'அழகுக்கலை மற்றும் சிகையலங்காரம்' },
  { category: 'vocational_stream', code: 'STREAM_AGRICULTURE_FOOD', sort: 70, labelEn: 'Agriculture & Food Technology', labelSi: 'කෘෂිකාර්මික හා ආහාර තාක්ෂණය', labelTa: 'விவசாயம் மற்றும் உணவு தொழில்நுட்பம்' },
  { category: 'vocational_stream', code: 'STREAM_APPAREL_GARMENT', sort: 80, labelEn: 'Textile & Garment Manufacturing', labelSi: 'ඇඟලුම් හා රෙදිපිළි', labelTa: 'ஆடை மற்றும் ஜவுளி' },
  { category: 'vocational_stream', code: 'STREAM_HEALTHCARE_CARE', sort: 90, labelEn: 'Healthcare & Nursing Support', labelSi: 'සෞඛ්‍ය සහ උපස්ථාන සේවා', labelTa: 'சுகாதார மற்றும் பராமரிப்பு சேவைகள்' },
  { category: 'vocational_stream', code: 'STREAM_OTHER', sort: 100, labelEn: 'Other Stream', labelSi: 'වෙනත් ක්ෂේත්‍රයක්', labelTa: 'ஏனைய துறை' },
  { category: 'vocational_stream', code: 'TODO_OWNER_STREAM_1', sort: 999, labelEn: 'Pending Owner Specification', labelSi: 'අයිතිකරුගේ තහවුරු කිරීම අපේක්ෂිතයි', labelTa: 'உரிமையாளரின் உறுதிப்படுத்தல் தேவை' },

  // 4. Interested Job (Baseline per B1)
  { category: 'job', code: 'JOB_SOFTWARE_DEV', sort: 10, labelEn: 'Software Developer / IT Technician', labelSi: 'මෘදුකාංග සංවර්ධක / තොරතුරු තාක්ෂණ ශිල්පී', labelTa: 'மென்பொருள் உருவாக்குநர் / IT தொழில்நுட்ப வல்லுநர்' },
  { category: 'job', code: 'JOB_ELECTRICIAN', sort: 20, labelEn: 'Electrician / Wireman', labelSi: 'විදුලි කාර්මික', labelTa: 'மின்சார தொழில்நுட்பவியலாளர்' },
  { category: 'job', code: 'JOB_MECHANIC', sort: 30, labelEn: 'Auto Mechanic', labelSi: 'මෝටර් රථ කාර්මික', labelTa: 'மோட்டார் மெக்கானிக்' },
  { category: 'job', code: 'JOB_PLUMBER', sort: 40, labelEn: 'Plumber', labelSi: 'ජලනල කාර්මික', labelTa: 'குழாய் பொருத்துனர்' },
  { category: 'job', code: 'JOB_CARPENTER', sort: 50, labelEn: 'Carpenter / Mason', labelSi: 'වඩු / පෙදරේරු කාර්මික', labelTa: 'தச்சர் / கொத்தனார்' },
  { category: 'job', code: 'JOB_CHEF_COOK', sort: 60, labelEn: 'Chef / Cook', labelSi: 'ප්‍රධාන සූපවේදී / කෝකි', labelTa: 'சமையல் கலைஞர் / சமையல்காரர்' },
  { category: 'job', code: 'JOB_BEAUTICIAN', sort: 70, labelEn: 'Beautician / Hair Stylist', labelSi: 'රූපලාවණ්‍ය ශිල්පී', labelTa: 'அழகுக்கலைஞர் / முடி திருத்துனர்' },
  { category: 'job', code: 'JOB_NURSE_CAREGIVER', sort: 80, labelEn: 'Nursing Assistant / Caregiver', labelSi: 'හෙද සහායක / උපස්ථායක', labelTa: 'தாதி உதவியாளர் / பராமரிப்பாளர்' },
  { category: 'job', code: 'JOB_CLERICAL_ADMIN', sort: 90, labelEn: 'Office Clerk / Data Entry', labelSi: 'කාර්යාල ලිපිකරු / දත්ත ඇතුලත් කිරීමේ ශිල්පී', labelTa: 'அலுவலக எழுத்தர் / தரவு உள்ளீட்டாளர்' },
  { category: 'job', code: 'JOB_SALES_MARKETING', sort: 100, labelEn: 'Sales & Marketing Representative', labelSi: 'අලෙවි නියෝජිත', labelTa: 'விற்பனை பிரதிநிதி' },
  { category: 'job', code: 'JOB_OTHER', sort: 110, labelEn: 'Other Job', labelSi: 'වෙනත් රැකියාවක්', labelTa: 'ஏனைய தொழில்' },
  { category: 'job', code: 'TODO_OWNER_JOB_1', sort: 999, labelEn: 'Pending Owner Specification', labelSi: 'අයිතිකරුගේ තහවුරු කිරීම අපේක්ෂිතයි', labelTa: 'உரிமையாளரின் உறுதிப்படுத்தல் தேவை' },

  // 5. Future Hopes (DD/S/001 Item 10.12)
  { category: 'future_hope', code: 'higher_education', sort: 10, labelEn: 'Higher Education', labelSi: 'උසස් අධ්‍යාපනය', labelTa: 'உயர் கல்வி' },
  { category: 'future_hope', code: 'vocational_education', sort: 20, labelEn: 'Vocational Education', labelSi: 'වෘත්තීය අධ්‍යාපනය', labelTa: 'தொழிற்கல்வி' },
  { category: 'future_hope', code: 'entrepreneur', sort: 30, labelEn: 'Entrepreneurship / Self-employment', labelSi: 'ව්‍යවසායකත්වය / ස්වයං රැකියා', labelTa: 'தொழில்முனைவு / சுயதொழில்' },
  { category: 'future_hope', code: 'local_job', sort: 40, labelEn: 'Local Job', labelSi: 'දේශීය රැකියාවක්', labelTa: 'உள்நாட்டு வேலை' },
  { category: 'future_hope', code: 'foreign_job', sort: 50, labelEn: 'Foreign Job', labelSi: 'විදේශ රැකියාවක්', labelTa: 'வெளிநாட்டு வேலை' },

  // 6. Information Provided By (DD/S/001 Item 10.13)
  { category: 'info_provided_by', code: 'self', sort: 10, labelEn: 'Self', labelSi: 'තමාම', labelTa: 'தானே' },
  { category: 'info_provided_by', code: 'mother', sort: 20, labelEn: 'Mother', labelSi: 'මව', labelTa: 'தாய்' },
  { category: 'info_provided_by', code: 'father', sort: 30, labelEn: 'Father', labelSi: 'පියා', labelTa: 'தந்தை' },
  { category: 'info_provided_by', code: 'sister', sort: 40, labelEn: 'Sister', labelSi: 'සහෝදරිය', labelTa: 'சகோதரி' },
  { category: 'info_provided_by', code: 'other', sort: 50, labelEn: 'Other (specify)', labelSi: 'වෙනත් (සඳහන් කරන්න)', labelTa: 'ஏனையோர் (குறிப்பிடவும்)' },
];
