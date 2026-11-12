/**
 * জাতীয় বিশ্ববিদ্যালয় (NU) CGPA ক্যালকুলেটর ডেটা —
 * pimathclub.com/cgpa-calculator-এর সম্পূর্ণ subjectData হুবহু কপি
 * (BA ৯ · BBA ৪ · BSc ১২ · BSS ৫ = ৩০টি বিভাগ, ৯৭৮টি কোর্স + ক্রেডিট)।
 *
 * প্রতিটি বিভাগের বর্ষভিত্তিক core + optional (optionalLimit সহ) কোর্স তালিকা —
 * কোর্স কোড, নাম ও ক্রেডিট সোর্স থেকে অপরিবর্তিত।
 */

export interface NuCourse {
  /** কোর্সের নাম */
  name: string
  /** কোর্স কোড (যেখানে নিশ্চিত) */
  code?: string
  /** ক্রেডিট সংখ্যা */
  credits: number
}

export interface NuOptionalBlock {
  /** সেকশন হেডার */
  bn: string
  en: string
  /** কতটি ঐচ্ছিক নিতে হয় (সোর্সের optionalLimit) */
  limit?: number
  courses: NuCourse[]
}

export interface NuYearData {
  bn: string
  en: string
  courses: NuCourse[]
  optional?: NuOptionalBlock
}

export interface NuDept {
  id: string
  bn: string
  en: string
  years: NuYearData[]
}

export interface NuProgram {
  id: 'BSc' | 'BA' | 'BSS' | 'BBA'
  bn: string
  en: string
  depts: NuDept[]
}

const BSc_DEPTS: NuDept[] = [
  {
    id: 'Biochemistry and Molecular Biology',
    bn: 'প্রাণরসায়ন ও আণবিক জীববিজ্ঞান',
    en: 'Biochemistry and Molecular Biology',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Biophysical and Bioorganic Chemistry', code: '212901', credits: 4 },
          { name: 'Introductory Biochemistry', code: '212903', credits: 4 },
          { name: 'Biochemistry Practical', code: '212904', credits: 4 },
          { name: 'Botany-I', code: '213007', credits: 4 },
          { name: 'Botany-I  Practical', code: '213008', credits: 2 },
          { name: 'Zoology-I', code: '213105', credits: 4 },
          { name: 'Zoology-I Practical', code: '213106', credits: 2 },
          { name: 'History of the Emergence of Independent of Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Enzymes & Bioenergetics', code: '222901', credits: 4 },
          { name: 'Carbohydrates Metabolism', code: '222903', credits: 2 },
          { name: 'Molecular Biology-I', code: '222905', credits: 4 },
          { name: 'Computer Fundamentals', code: '222907', credits: 2 },
          { name: 'Biochemistry Practical', code: '222908', credits: 4 },
          { name: 'Botany-II', code: '223007', credits: 4 },
          { name: 'Botany Practical-II', code: '223008', credits: 2 },
          { name: 'Zoology-II', code: '223107', credits: 4 },
          { name: 'Zoology Practical-II', code: '223108', credits: 2 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Metabolism of Lipids and Nitrogenous Compounds', code: '232901', credits: 4 },
          { name: 'Molecular Biology-II', code: '232903', credits: 4 },
          { name: 'Molecular Genetics & Clinical Biochemistry', code: '232905', credits: 4 },
          { name: 'Microbiology', code: '232907', credits: 4 },
          { name: 'Human Physiology', code: '232909', credits: 4 },
          { name: 'Human Nutrition', code: '232911', credits: 4 },
          { name: 'Endocrinology', code: '232913', credits: 4 },
          { name: 'Practical', code: '232914', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Cell Biology', code: '242901', credits: 4 },
          { name: 'Molecular Biology-III', code: '242903', credits: 4 },
          { name: 'Plant Biochemistry & Biotechnology', code: '242905', credits: 4 },
          { name: 'Immunology', code: '242907', credits: 4 },
          { name: 'Industrial Biotechnology', code: '242909', credits: 4 },
          { name: 'Virology & Cancer Biology', code: '242911', credits: 4 },
          { name: 'Biochemistry of Natural Products', code: '242913', credits: 4 },
          { name: 'Biostatistics', code: '242915', credits: 4 },
          { name: 'Practical', code: '242916', credits: 4 },
          { name: 'Viva-voce', code: '242918', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Botany',
    bn: 'উদ্ভিদবিজ্ঞান',
    en: 'Botany',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Microbiology', code: '213001', credits: 3 },
          { name: 'Mycology', code: '213003', credits: 3 },
          { name: 'Phycology', code: '213005', credits: 3 },
          { name: 'Practical-I', code: '213006', credits: 3 },
          { name: 'Chemistry-I', code: '212807', credits: 4 },
          { name: 'Chemistry-I Practical', code: '212808', credits: 2 },
          { name: 'Zoology-I', code: '213105', credits: 4 },
          { name: 'Zoology Practical – I', code: '213106', credits: 2 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Higher Cryptogams', code: '223001', credits: 4 },
          { name: 'Taxonomy of Angiosperms', code: '223003', credits: 4 },
          { name: 'Plant Anatomy and Embryology', code: '223005', credits: 4 },
          { name: 'Practical- II', code: '223006', credits: 4 },
          { name: 'General Chemistry-II', code: '222807', credits: 4 },
          { name: 'Environmental Chemistry', code: '222809', credits: 2 },
          { name: 'Zoology- II', code: '223107', credits: 4 },
          { name: 'Zoology Practical- II', code: '223108', credits: 2 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Gymnosperm, Paleobotany and Palynology', code: '233001', credits: 4 },
          { name: 'Plant Physiology and Plant Nutrition', code: '233003', credits: 4 },
          { name: 'Plant Biochemistry', code: '233005', credits: 4 },
          { name: 'Ecology and Environmental Science', code: '233007', credits: 4 },
          { name: 'Plant Pathology', code: '233009', credits: 4 },
          { name: 'Cytology and Cytogenetics', code: '233011', credits: 4 },
          { name: 'Genetics', code: '233013', credits: 4 },
          { name: 'Practical-III', code: '233014', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Agronomy and Horticulture', code: '243001', credits: 4 },
          { name: 'Economic Botany, Ethnobotany and Pharmacognosy', code: '243003', credits: 4 },
          { name: 'Limnology and Aquaculture', code: '243005', credits: 4 },
          { name: 'Biodiversity and Evolution', code: '243007', credits: 4 },
          { name: 'Plant Breeding', code: '243009', credits: 4 },
          { name: 'Molecular Biology and Bioinformatics', code: '243011', credits: 4 },
          { name: 'Biostatistics and Research Methodology', code: '243013', credits: 4 },
          { name: 'Biotechnology and Genetic Engineering', code: '243015', credits: 4 },
          { name: 'Practical Paper-IV', code: '243016', credits: 4 },
          { name: 'Viva-Voce', code: '243018', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Chemistry',
    bn: 'রসায়ন',
    en: 'Chemistry',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Physical Chemistry-I', code: '212801', credits: 3 },
          { name: 'Fundamentals of Organic Chemistry', code: '212803', credits: 3 },
          { name: 'Fundamentals of Inorganic Chemistry', code: '212805', credits: 3 },
          { name: 'Chemistry Practical: Qualitative inorganic analysis, inorganic preparations and elementary crystal chemistry', code: '212806', credits: 3 },
          { name: 'Fundamentals of Mathematics', code: '213709', credits: 4 },
          { name: 'Calculus-I', code: '213711', credits: 2 },
          { name: 'Physics-I (Mechanics, Properties of Matter, Waves & Optics)', code: '212707', credits: 4 },
          { name: 'Physics-II (Heat, Thermodynamics and Radiation)', code: '212709', credits: 2 },
          { name: 'History of the Emergence of Independent of Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Physical Chemistry-II', code: '222801', credits: 4 },
          { name: 'Organic Chemistry', code: '222803', credits: 4 },
          { name: 'Chemistry of the Representative Elements', code: '222805', credits: 4 },
          { name: 'Quantitative Inorganic Analysis (Practical)', code: '222806', credits: 4 },
          { name: 'Physics-III (Electricity and Modern Physics)', code: '222707', credits: 4 },
          { name: 'Physics-IV (Physics Practical)', code: '222708', credits: 2 },
          { name: 'Calculus-II', code: '223707', credits: 4 },
          { name: 'Math Lab (Practical)', code: '223708', credits: 2 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Physical Chemistry-III', code: '232801', credits: 4 },
          { name: 'Stereochemistry', code: '232803', credits: 4 },
          { name: 'Advanced Concepts of Atomic Structure and Chemical Bonding', code: '232805', credits: 4 },
          { name: 'Coordination Chemistry and Organometallic Chemistry', code: '232807', credits: 4 },
          { name: 'Fundamentals of Analytical Chemistry', code: '232809', credits: 4 },
          { name: 'Industrial Chemistry', code: '232811', credits: 4 },
          { name: 'Agricultural Chemistry', code: '232813', credits: 4 },
          { name: 'Physical Chemistry Practical', code: '232814', credits: 2 },
          { name: 'Organic Chemistry Practical (Detection & Preparation)', code: '232816', credits: 2 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Physical Chemistry-IV', code: '242801', credits: 4 },
          { name: 'Selected Topics in Organic Chemistry', code: '242803', credits: 4 },
          { name: 'Selected Topics in Inorganic Chemistry', code: '242805', credits: 4 },
          { name: 'Nuclear Chemistry', code: '242807', credits: 4 },
          { name: 'Organic Polymers', code: '242809', credits: 4 },
          { name: 'Reaction Mechanism', code: '242811', credits: 4 },
          { name: 'Separation Techniques', code: '242813', credits: 4 },
          { name: 'Chemical Spectroscopy', code: '242815', credits: 4 },
          { name: 'Practical Chemistry (Organic)', code: '242816', credits: 2 },
          { name: 'Practical Chemistry (Industrial)', code: '242818', credits: 2 },
          { name: 'Viva-voce', code: '242820', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Environmental Science',
    bn: 'পরিবেশ বিজ্ঞান',
    en: 'Environmental Science',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introduction to Environmental Science', code: '214401', credits: 4 },
          { name: 'Fundamental of Chemistry', code: '214403', credits: 4 },
          { name: 'Fundamental of Earth Sciences', code: '214405', credits: 4 },
          { name: 'Fundamental of Biological Sciences', code: '214407', credits: 4 },
          { name: 'Mathematics and Statistics for Environmental Sciences', code: '214409', credits: 4 },
          { name: 'Laboratory and Field work on Environmental Sciences', code: '214410', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Environmental Chemistry', code: '224401', credits: 4 },
          { name: 'Environmental Earth Sciences and Soil Sciences', code: '224403', credits: 4 },
          { name: 'Environmental Biology', code: '224405', credits: 4 },
          { name: 'Economics and Environmental Economics', code: '224407', credits: 4 },
          { name: 'Meteorology and Climate Process', code: '224409', credits: 4 },
          { name: 'Information Technology', code: '224411', credits: 4 },
          { name: 'Laboratory and Field work on Environmental Sciences', code: '224412', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Integrated Coastal Zone and Floodplain Managements', code: '234401', credits: 4 },
          { name: 'Ecology and Biodiversity', code: '234403', credits: 4 },
          { name: 'Environmental and Social Impact Assessment (EIA and SIA)', code: '234405', credits: 4 },
          { name: 'Environmental Toxicology', code: '234407', credits: 4 },
          { name: 'Remote Sensing and GIS', code: '234409', credits: 4 },
          { name: 'Geography and Geology of the Bengal Basin', code: '234411', credits: 4 },
          { name: 'Hydrology and Water Resources', code: '234413', credits: 4 },
          { name: 'Laboratory and Field work on Environmental Sciences', code: '234414', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Research Methodology', code: '244401', credits: 4 },
          { name: 'Climate Change', code: '244403', credits: 4 },
          { name: 'Environmental Hazards and Disaster Managements', code: '244405', credits: 4 },
          { name: 'Water Resources Management in Bangladesh', code: '244407', credits: 4 },
          { name: 'Waste Management', code: '244409', credits: 4 },
          { name: 'Environmental Laws, Protocols and Ethics', code: '244411', credits: 4 },
          { name: 'Instrumental Techniques in Environmental Analysis', code: '244413', credits: 4 },
          { name: 'Energy, Environment and Sustainable Development: Bangladesh Perspective', code: '244415', credits: 4 },
          { name: 'Agriculture and Environment', code: '244417', credits: 4 },
          { name: 'Viva-voce', code: '244418', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Geography and Environment',
    bn: 'ভূগোল ও পরিবেশ',
    en: 'Geography and Environment',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introduction to Geography and Environment', code: '213201', credits: 3 },
          { name: 'Introduction to Physical Geography', code: '213203', credits: 3 },
          { name: 'Introduction to Human Geography', code: '213205', credits: 3 },
          { name: 'Practical-I', code: '213206', credits: 3 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 7টি)',
          en: 'Optional Subjects (any 7)',
          limit: 7,
          courses: [
            { name: 'Chemistry-I', code: '212807', credits: 4 },
            { name: 'Chemistry Practical', code: '212808', credits: 2 },
            { name: 'Fundamentals of Mathematics', code: '213709', credits: 4 },
            { name: 'Calculus-I', code: '213711', credits: 2 },
            { name: 'Botany-I', code: '213007', credits: 4 },
            { name: 'Botany-I Practical', code: '213008', credits: 2 },
            { name: 'Zoology-I', code: '213105', credits: 4 },
            { name: 'Zoology Practical - I', code: '213106', credits: 2 },
            { name: 'Introduction to Statistics', code: '213607', credits: 4 },
            { name: 'Statistics Practical-I', code: '213608', credits: 2 },
            { name: 'Introductory Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
            { name: 'Introduction to Psychology', code: '213905', credits: 4 },
            { name: 'Principles of Economics', code: '212209', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Geomorphology', code: '223201', credits: 4 },
          { name: 'Climatology', code: '223203', credits: 4 },
          { name: 'Economic Geography', code: '223205', credits: 4 },
          { name: 'Practical-II', code: '223206', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 7টি)',
          en: 'Optional Subjects (any 7)',
          limit: 7,
          courses: [
            { name: 'General Chemistry-II', code: '222807', credits: 4 },
            { name: 'Environmental Chemistry', code: '222809', credits: 2 },
            { name: 'Calculus-II', code: '223707', credits: 4 },
            { name: 'Math Lab (Practical)', code: '223708', credits: 2 },
            { name: 'Botany-II', code: '223007', credits: 4 },
            { name: 'Botany Practical-II', code: '223008', credits: 2 },
            { name: 'Zoology-II', code: '223107', credits: 4 },
            { name: 'Zoology Practical-II', code: '223108', credits: 2 },
            { name: 'Methods of Statistics', code: '223609', credits: 4 },
            { name: 'Statistics Practical-II', code: '223610', credits: 2 },
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
            { name: 'Political Organization and The Political System  of  UK and USA', code: '221909', credits: 4 },
            { name: 'Bangladesh Economy', code: '222209', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Environmental Geography', code: '233201', credits: 4 },
          { name: 'Soil and Biogeography', code: '233203', credits: 4 },
          { name: 'Geography of Bangladesh', code: '233205', credits: 4 },
          { name: 'World Regional Geography', code: '233207', credits: 4 },
          { name: 'Cultural Geography', code: '233209', credits: 4 },
          { name: 'Population Geography', code: '233211', credits: 4 },
          { name: 'Quantitative Geography', code: '233213', credits: 4 },
          { name: 'Practical–III', code: '233214', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Geographical Thoughts and Concepts', code: '243201', credits: 4 },
          { name: 'Oceanography', code: '243203', credits: 4 },
          { name: 'Geography of Disasters', code: '243205', credits: 4 },
          { name: 'Political Geography', code: '243207', credits: 4 },
          { name: 'Agricultural Geography', code: '243209', credits: 4 },
          { name: 'Geography of South Asia', code: '243211', credits: 4 },
          { name: 'Urban Geography', code: '243213', credits: 4 },
          { name: 'Principles of Remote Sensing and Geographic Information System', code: '243215', credits: 4 },
          { name: 'Practical-IV', code: '243216', credits: 4 },
          { name: 'Viva-voce', code: '243218', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Home Economics',
    bn: 'গৃহ অর্থনীতি',
    en: 'Home Economics',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Philosophy and Purpose of Home Management', code: '213501', credits: 3 },
          { name: 'Maternal - Child Health and Early childhood Education', code: '213503', credits: 3 },
          { name: 'Applied Art and Textile', code: '213505', credits: 3 },
          { name: 'Home Economics Practical', code: '213506', credits: 3 },
          { name: 'Introduction to Human Physiology', code: '213507', credits: 4 },
          { name: 'Practical', code: '213508', credits: 2 },
          { name: 'Elementary Biochemistry', code: '213509', credits: 4 },
          { name: 'Practical', code: '213510', credits: 2 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Housing and Interior Decoration', code: '223501', credits: 4 },
          { name: 'Principles of Family Clothing', code: '223503', credits: 4 },
          { name: 'Household Physics', code: '223505', credits: 4 },
          { name: 'Household Physics (Practical)', code: '223506', credits: 2 },
          { name: 'Developmental Psychology', code: '223507', credits: 4 },
          { name: 'Developmental Psychology (Practical)', code: '223508', credits: 2 },
          { name: 'Basic Nutrition and Food Security, Safety', code: '223409', credits: 4 },
          { name: 'Practical', code: '223410', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Meal Management', code: '233501', credits: 4 },
          { name: 'Child Behaviour and Guidance', code: '233503', credits: 4 },
          { name: 'History Art Culture of Bangladesh', code: '233505', credits: 4 },
          { name: 'Textile Design and Weaving', code: '233507', credits: 4 },
          { name: 'Human Nutrition and Dietetics', code: '233509', credits: 4 },
          { name: 'Environment, Ecology and Household Equipments', code: '233511', credits: 4 },
          { name: 'Family and Child Welfare in Bangladesh', code: '233513', credits: 4 },
          { name: 'Practical', code: '233514', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Food Science and Technology', code: '243501', credits: 4 },
          { name: 'Counselling in Family', code: '243503', credits: 4 },
          { name: 'Family Resource Management', code: '243505', credits: 4 },
          { name: 'Textile Manugacturing and Merchandising', code: '243507', credits: 4 },
          { name: 'Community Nutrition and Public Health', code: '243509', credits: 4 },
          { name: 'The Child with Special Needs', code: '243511', credits: 4 },
          { name: 'Art and Craft: Income Generating Sources for Women', code: '243513', credits: 4 },
          { name: 'Home Economics Education', code: '243515', credits: 4 },
          { name: 'Practical', code: '243516', credits: 4 },
          { name: 'Viva-voce', code: '243518', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Mathematics',
    bn: 'গণিত',
    en: 'Mathematics',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Fundamentals of Mathematics', code: '213701', credits: 3 },
          { name: 'Calculus – I', code: '213703', credits: 3 },
          { name: 'Linear Algebra', code: '213705', credits: 3 },
          { name: 'Analytic and Vector Geometry', code: '213707', credits: 3 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 4টি)',
          en: 'Optional Subjects (any 4)',
          limit: 4,
          courses: [
            { name: 'Chemistry-I', code: '212807', credits: 4 },
            { name: 'Chemistry-I Practical', code: '212808', credits: 2 },
            { name: 'Introduction to Statistics', code: '213607', credits: 4 },
            { name: 'Statistics Practical-I', code: '213608', credits: 2 },
            { name: 'Physics-I (Mechanics, Properties of Matter, Waves & Optics)', code: '212707', credits: 4 },
            { name: 'Physics-II (Heat, Thermodynamics and Radiation)', code: '212709', credits: 2 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Calculus –II', code: '223701', credits: 4 },
          { name: 'Ordinary Differential Equations', code: '223703', credits: 4 },
          { name: 'Computer Programming (Fortran)', code: '223705', credits: 4 },
          { name: 'Math Lab (Practical)', code: '223706', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 4টি)',
          en: 'Optional Subjects (any 4)',
          limit: 4,
          courses: [
            { name: 'Physics-III (Electricity and Modern Physics)', code: '222707', credits: 4 },
            { name: 'Physics-IV (Physics Practical)', code: '222708', credits: 2 },
            { name: 'General Chemistry-II', code: '222807', credits: 4 },
            { name: 'Environmental Chemistry', code: '222809', credits: 2 },
            { name: 'Methods of Statistics', code: '223609', credits: 4 },
            { name: 'Statistics Practical-II', code: '223610', credits: 2 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Abstract Algebra', code: '233701', credits: 4 },
          { name: 'Real Analysis', code: '233703', credits: 4 },
          { name: 'Numerical Analysis', code: '233705', credits: 4 },
          { name: 'Complex Analysis', code: '233707', credits: 4 },
          { name: 'Differential Geometry', code: '233709', credits: 4 },
          { name: 'Mechanics', code: '233711', credits: 4 },
          { name: 'Linear Programming', code: '233713', credits: 4 },
          { name: 'Math Lab (Practical)', code: '233714', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Theory of Numbers', code: '243701', credits: 4 },
          { name: 'Topology & Functional Analysis', code: '243703', credits: 4 },
          { name: 'Methods of Applied Mathematics', code: '243705', credits: 4 },
          { name: 'Tensor Analysis', code: '243707', credits: 4 },
          { name: 'Partial Differential equations', code: '243709', credits: 4 },
          { name: 'Hydrodynamics', code: '243711', credits: 4 },
          { name: 'Math Lab (Practical)', code: '243718', credits: 4 },
          { name: 'Viva-Voce (Comprehensive)', code: '243720', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 2টি)',
          en: 'Optional Subjects (any 2)',
          limit: 2,
          courses: [
            { name: 'Discrete Mathematics', code: '243713', credits: 4 },
            { name: 'Astronomy', code: '243715', credits: 4 },
            { name: 'Mathematical Modeling in Biology', code: '243717', credits: 4 },
          ],
        },
      },
    ],
  },
  {
    id: 'Physics',
    bn: 'পদার্থবিজ্ঞান',
    en: 'Physics',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Mechanics', code: '212701', credits: 3 },
          { name: 'Properties of Matter, Waves & Oscillations', code: '212703', credits: 3 },
          { name: 'Heat, Thermodynamics and Radiation', code: '212705', credits: 3 },
          { name: 'Physics Practical-I', code: '212706', credits: 3 },
          { name: 'Fundamentals of Mathematics', code: '213709', credits: 4 },
          { name: 'Calculus-I', code: '213711', credits: 2 },
          { name: 'Chemistry-I', code: '212807', credits: 4 },
          { name: 'Chemistry-I Practical', code: '212808', credits: 2 },
          { name: 'Introduction to Statistics', code: '213607', credits: 4 },
          { name: 'Statistics Practical-I', code: '213608', credits: 2 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Electricity & Magnetism', code: '222701', credits: 4 },
          { name: 'Geometrical & Physical Optics', code: '222703', credits: 4 },
          { name: 'Classical Mechanics', code: '222705', credits: 4 },
          { name: 'Physics Practical-II', code: '222706', credits: 4 },
          { name: 'Calculus-II', code: '223707', credits: 4 },
          { name: 'Math Lab (Practical)', code: '223708', credits: 2 },
          { name: 'General Chemistry-II', code: '222807', credits: 4 },
          { name: 'Enviromental Chemistry', code: '222809', credits: 2 },
          { name: 'Methods of Statistics', code: '223609', credits: 4 },
          { name: 'Statistics Practical-II', code: '223610', credits: 2 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Atomic & Molecular Physics', code: '232701', credits: 4 },
          { name: 'Quantum Mechanics-I', code: '232703', credits: 4 },
          { name: 'Computer Fundamentals and Numerical Analysis', code: '232705', credits: 4 },
          { name: 'Electronics-I', code: '232707', credits: 4 },
          { name: 'Nuclear Physics-I', code: '232709', credits: 4 },
          { name: 'Solid State Physics-I', code: '232711', credits: 4 },
          { name: 'Mathematical Physics', code: '232713', credits: 4 },
          { name: 'Physics Practical-III', code: '232714', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Nuclear Physics-II', code: '242701', credits: 4 },
          { name: 'Solid State Physics-II', code: '242703', credits: 4 },
          { name: 'Quantum Mechanics-II', code: '242705', credits: 4 },
          { name: 'Electronics-II', code: '242707', credits: 4 },
          { name: 'Classical Electrodynamics', code: '242709', credits: 4 },
          { name: 'Statistical Mechanics', code: '242711', credits: 4 },
          { name: 'Computer Application and Programming', code: '242713', credits: 4 },
          { name: 'Theory of Relativity and Cosmology', code: '242715', credits: 4 },
          { name: 'Physics Practical-IV', code: '242716', credits: 4 },
          { name: 'Viva-Voce', code: '242718', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Psychology',
    bn: 'মনোবিজ্ঞান',
    en: 'Psychology',
    years: [
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Theories of Motivation', code: '243401', credits: 4 },
          { name: 'Theories of Learning', code: '243403', credits: 4 },
          { name: 'Theories of Perception', code: '243405', credits: 4 },
          { name: 'Theories of Personality', code: '243407', credits: 4 },
          { name: 'Educational Psychology', code: '243409', credits: 4 },
          { name: 'Industrial-Organizational Psychology', code: '243411', credits: 4 },
          { name: 'Counseling Psychology', code: '243413', credits: 4 },
          { name: 'Clinical Psychology', code: '243415', credits: 4 },
          { name: 'Practical Research Project', code: '243416', credits: 4 },
          { name: 'Viva voce', code: '243418', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Soil Science',
    bn: 'মৃত্তিকা বিজ্ঞান',
    en: 'Soil Science',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introductory Soils-I', code: '213301', credits: 4 },
          { name: 'Introductory Soils-II', code: '213303', credits: 4 },
          { name: 'Soil Science Practical', code: '213304', credits: 4 },
          { name: 'Chemistry-I', code: '212807', credits: 4 },
          { name: 'Chemistry-I Practical', code: '212808', credits: 2 },
          { name: 'Botany-I', code: '213007', credits: 4 },
          { name: 'Botany-I Practical', code: '213008', credits: 2 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Soil Physics-I', code: '223301', credits: 4 },
          { name: 'General Microbiology', code: '223303', credits: 4 },
          { name: 'Soil Mineralogy and Colloids', code: '223305', credits: 4 },
          { name: 'Soil Science Practical', code: '223306', credits: 4 },
          { name: 'General Chemistry-II', code: '222807', credits: 4 },
          { name: 'Environmental Chemistry', code: '222809', credits: 2 },
          { name: 'Botany-II', code: '223007', credits: 4 },
          { name: 'Botany Practical-II', code: '223008', credits: 2 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Pedology', code: '233301', credits: 4 },
          { name: 'Soil Physics-II', code: '233303', credits: 4 },
          { name: 'Soil Chemistry', code: '233305', credits: 4 },
          { name: 'Soil Microbiology', code: '233307', credits: 4 },
          { name: 'Soil Fertility and Plant Nutrition', code: '233309', credits: 4 },
          { name: 'Environmental Pollutions and Waste Management', code: '233311', credits: 4 },
          { name: 'Soil and Plant Biochemistry', code: '233313', credits: 4 },
          { name: 'Practical', code: '233314', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Soil Survey and Land Evaluation', code: '243301', credits: 4 },
          { name: 'Soil Conservation and Soil Management', code: '243303', credits: 4 },
          { name: 'Soil classification and Soils of Bangladesh', code: '243305', credits: 4 },
          { name: 'Irrigation and Drainage', code: '243307', credits: 4 },
          { name: 'Soil Ecology', code: '243309', credits: 4 },
          { name: 'Principles of Agronomy', code: '243311', credits: 4 },
          { name: 'Fertilizers and Agricultural Statistics', code: '243313', credits: 4 },
          { name: 'Crops of Bangladesh', code: '243315', credits: 4 },
          { name: 'Practical', code: '243316', credits: 4 },
          { name: 'Viva-Voce', code: '243318', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Statistics',
    bn: 'পরিসংখ্যান',
    en: 'Statistics',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introductory Statistics', code: '213601', credits: 4 },
          { name: 'Introductory Probability & Numerical Mathematics', code: '213603', credits: 4 },
          { name: 'Lab 1: Descriptive Statistics', code: '213604', credits: 2 },
          { name: 'Lab 2: Numerical   Mathematics', code: '213606', credits: 2 },
          { name: 'Fundamentals of Mathematics', code: '213709', credits: 4 },
          { name: 'Calculus-I', code: '213711', credits: 2 },
          { name: 'Principles of Economics', code: '212209', credits: 4 },
          { name: 'Bangladesh Agricultural Economics', code: '212211', credits: 2 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Probability Distribution', code: '223601', credits: 4 },
          { name: 'Sampling Technique', code: '223603', credits: 4 },
          { name: 'Linear Algebra', code: '223605', credits: 4 },
          { name: 'Lab-3: Probability Distribution and Sampling Technique', code: '223606', credits: 2 },
          { name: 'Lab-4: Linear algebra', code: '223608', credits: 2 },
          { name: 'Calculus- II', code: '223707', credits: 4 },
          { name: 'Math Lab (Practical)', code: '223708', credits: 2 },
          { name: 'Money, Banking and Public finance', code: '222211', credits: 4 },
          { name: 'Bangladesh Economy', code: '222213', credits: 2 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Sampling Distribution', code: '233601', credits: 4 },
          { name: 'Statistical Inference', code: '233603', credits: 4 },
          { name: 'Regression Analysis', code: '233605', credits: 4 },
          { name: 'Design of Experiments', code: '233607', credits: 4 },
          { name: 'Applied Statistics', code: '233609', credits: 4 },
          { name: 'Introduction to computer and SPSS', code: '233611', credits: 4 },
          { name: 'Lab 5: Statistical Inference', code: '233612', credits: 2 },
          { name: 'Lab 6: Regression Analysis', code: '233614', credits: 2 },
          { name: 'Lab 7: Design of Experiments', code: '233616', credits: 2 },
          { name: 'Lab 8: Applied Statistics', code: '233618', credits: 2 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Multivariate Analysis', code: '243601', credits: 4 },
          { name: 'Advance Sampling Technique', code: '243603', credits: 4 },
          { name: 'Demography', code: '243605', credits: 4 },
          { name: 'Computer Programming (FORTRAN & R)', code: '243607', credits: 4 },
          { name: 'Stochastic Process', code: '243609', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 4টি)',
          en: 'Optional Subjects (any 4)',
          limit: 4,
          courses: [
            { name: 'Econometrics', code: '243611', credits: 4 },
            { name: 'Operational Research and Research Methodology', code: '243613', credits: 4 },
            { name: 'Epidemiology & Biostatistics', code: '243615', credits: 4 },
            { name: 'Lab: 9 Multivariate Analysis', code: '243616', credits: 2 },
            { name: 'Lab: 10 Advance Sampling Technique', code: '243618', credits: 2 },
            { name: 'Lab: 11 Econometrics', code: '243620', credits: 2 },
            { name: 'Lab: 12 Operational Research & Demography', code: '243622', credits: 2 },
            { name: 'Lab: 13 Epidemiology & Biostatistics', code: '243624', credits: 2 },
            { name: 'Viva-voce', code: '243626', credits: 4 },
          ],
        },
      },
    ],
  },
  {
    id: 'Zoology',
    bn: 'প্রাণিবিজ্ঞান',
    en: 'Zoology',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introduction to Zoology', code: '213101', credits: 4 },
          { name: 'Animal diversity-1: Protozoa and Non-chordates', code: '213103', credits: 4 },
          { name: 'Zoology Practical-I', code: '213104', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 4টি)',
          en: 'Optional Subjects (any 4)',
          limit: 4,
          courses: [
            { name: 'Chemistry-I', code: '212807', credits: 4 },
            { name: 'Chemistry Practical-I', code: '212808', credits: 2 },
            { name: 'Biochemistry-I', code: '212905', credits: 4 },
            { name: 'Biochemistry-I Practical', code: '212906', credits: 2 },
            { name: 'Botany-I', code: '213007', credits: 4 },
            { name: 'Botany-I Practical', code: '213008', credits: 2 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Animal Diversity –II: Lower chordates and Chordates', code: '223101', credits: 4 },
          { name: 'Comparative Anatomy: Protozoa, Non-chordates and Chordates', code: '223103', credits: 4 },
          { name: 'Environmental Biology', code: '223105', credits: 4 },
          { name: 'Zoology Practical -II', code: '223106', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 4টি)',
          en: 'Optional Subjects (any 4)',
          limit: 4,
          courses: [
            { name: 'Botany-II', code: '223007', credits: 4 },
            { name: 'Botany Practical-II', code: '223008', credits: 2 },
            { name: 'General Chemistry-II', code: '222807', credits: 4 },
            { name: 'Environmental Chemistry', code: '222809', credits: 2 },
            { name: 'Biochemistry-II', code: '222909', credits: 4 },
            { name: 'Biochemistry Practical –II', code: '222910', credits: 2 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Evolution, Palaeontology and Zoogeography', code: '233101', credits: 4 },
          { name: 'Ecology', code: '233103', credits: 4 },
          { name: 'Genetics and Animal Breeding', code: '233105', credits: 4 },
          { name: 'Developmental Biology and Ethology', code: '233107', credits: 4 },
          { name: 'Human Physiology', code: '233109', credits: 4 },
          { name: 'Systematics, Demography and Family Planning', code: '233111', credits: 4 },
          { name: 'Cell and Molecular Biology', code: '233113', credits: 4 },
          { name: 'Zoology Practical-III', code: '233114', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Applied and Economic Zoology', code: '243101', credits: 4 },
          { name: 'Genetic Engineering and Biotechnology', code: '243103', credits: 4 },
          { name: 'Biostatistics and Research Methodology', code: '243105', credits: 4 },
          { name: 'Microbiology and Radiation Biology', code: '243107', credits: 4 },
          { name: 'Parasitology', code: '243109', credits: 4 },
          { name: 'Entomology', code: '243111', credits: 4 },
          { name: 'Fisheries Biology', code: '243113', credits: 4 },
          { name: 'Wildlife Biology', code: '243115', credits: 4 },
          { name: 'Zoology Practical-IV', code: '243116', credits: 4 },
          { name: 'Viva-voce', code: '243118', credits: 4 },
        ],
      },
    ],
  },
]

const BA_DEPTS: NuDept[] = [
  {
    id: 'Arabic',
    bn: 'আরবি',
    en: 'Arabic',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Al- Quran & Al-Hadith', code: '211201', credits: 4 },
          { name: 'History of Arabic Literature (500-750 AD)', code: '211203', credits: 4 },
          { name: 'Communicative Arabic-I', code: '211205', credits: 4 },
          { name: 'Arabic Grammar (Sarf)', code: '211207', credits: 4 },
          { name: 'Islamic Ideology-I', code: '211209', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Communicative Arabic-2', code: '221203', credits: 4 },
          { name: 'Arabic Grammar (Nahu)', code: '221205', credits: 4 },
          { name: 'History of Arabic Literature(750-1258 A.D)', code: '221207', credits: 4 },
          { name: 'Islamic Ideology-2', code: '221209', credits: 4 },
          { name: 'Political Organization and Political System of UK and USA', code: '221909', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Classical Prose', code: '231201', credits: 4 },
          { name: 'Modern Prose', code: '231203', credits: 4 },
          { name: 'Communicative Arabic- III', code: '231205', credits: 4 },
          { name: 'History of Arabic Literature (1258-1798 AD.)', code: '231207', credits: 4 },
          { name: 'Ilmul Balagah and Ilmul Arud', code: '231209', credits: 4 },
          { name: 'History of Islam (570-750 AD.)', code: '231211', credits: 4 },
          { name: 'Arabic Philology and Arabic Literary Criticism (Theoretical)', code: '231213', credits: 4 },
          { name: 'Muslim philosophy-I', code: '231215', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Modern poetry', code: '241201', credits: 4 },
          { name: 'History of Arabic Literature (1789-Till now)', code: '241203', credits: 4 },
          { name: 'Arabic Literary Criticism', code: '241205', credits: 4 },
          { name: 'Modern prose (Novel and Drama)', code: '241207', credits: 4 },
          { name: '`Ilmul Kalam', code: '241209', credits: 4 },
          { name: 'Communicative Arabic-IV', code: '241211', credits: 4 },
          { name: 'History of Islam (750-1258AD)', code: '241213', credits: 4 },
          { name: 'Studies of Arabic in Bengal', code: '241215', credits: 4 },
          { name: 'Muslim Philosophy-2', code: '241217', credits: 4 },
          { name: 'Viva-voce', code: '241218', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Bangla',
    bn: 'বাংলা',
    en: 'Bangla',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'History and Culture of Bangladesh and Bengalees (From Ancients to 2000 AD)', code: '211001', credits: 4 },
          { name: 'History of Bangla Language and Functional Bangla', code: '211003', credits: 4 },
          { name: 'Bangla Poetry-1', code: '211005', credits: 4 },
          { name: 'Bangla Novel-1', code: '211007', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'History of Bengali Literature -1 (Ancients and Medieval)', code: '221001', credits: 4 },
          { name: 'Poetry of Medieval Age', code: '221003', credits: 4 },
          { name: 'Bengali Poetry -2', code: '221005', credits: 4 },
          { name: 'Bengali Drama -1', code: '221007', credits: 4 },
          { name: 'Political Organization and The Political System of UK and USA', code: '221909', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'History of Bangla Literature-II, First part of Modern AGE (1801-1947)', code: '231001', credits: 4 },
          { name: 'Poetry of Anciant and Medieval AGE', code: '231003', credits: 4 },
          { name: 'Bangla Short Story-I', code: '231005', credits: 4 },
          { name: 'Theory of Folklor and Bangla Folk Literature', code: '231007', credits: 4 },
          { name: 'Literary forms, Literary principles (Theory Rasa), Ornamentation, Rhythm', code: '231009', credits: 4 },
          { name: 'Bangla Prose-I', code: '231011', credits: 4 },
          { name: 'Bangla Comedy and Literature of Traveling', code: '231013', credits: 4 },
          { name: 'Bangla Novel-2', code: '231015', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'History of Bangla Literature-3 (Development of Bangladeshi Literature Since 1947 to 2000)', code: '241001', credits: 4 },
          { name: 'Bangla Novel-3', code: '241003', credits: 4 },
          { name: 'Western Literary Theores and Methods of Literary Criticism', code: '241005', credits: 4 },
          { name: 'Bangla Drama-2', code: '241007', credits: 4 },
          { name: 'Classical Literature (Translated)', code: '241009', credits: 4 },
          { name: 'Bangla Short-Stories-2', code: '241011', credits: 4 },
          { name: 'Bangla Poetry-3', code: '241013', credits: 4 },
          { name: 'Phonetics and  Linguistics', code: '241015', credits: 4 },
          { name: 'Literature on Bangladesh Liberation War', code: '241017', credits: 4 },
          { name: 'Viva-voce', code: '241018', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'English',
    bn: 'ইংরেজি',
    en: 'English',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'English Reading Skills', code: '211101', credits: 4 },
          { name: 'English Writing Skills', code: '211103', credits: 4 },
          { name: 'Introduction to Poetry', code: '211105', credits: 4 },
          { name: 'Introduction to Prose: Fiction and Non- Fiction:', code: '211107', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Introduction to Drama', code: '221101', credits: 4 },
          { name: 'Romantic Poetry', code: '221103', credits: 4 },
          { name: 'Advanced Reading and Writing', code: '221105', credits: 4 },
          { name: 'History of English Literature', code: '221107', credits: 4 },
          { name: 'Political Organization and The Political System of UK and USA', code: '221909', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Elizabethan and Jacobean Drama', code: '231101', credits: 4 },
          { name: '16th and 17th Century Poetry', code: '231103', credits: 4 },
          { name: '17th and 18th Century Non-Fictional Prose', code: '231105', credits: 4 },
          { name: 'Restoration and Eighteenth Century Fiction', code: '231107', credits: 4 },
          { name: 'Restoration and Eighteenth Century Poetry and Drama', code: '231109', credits: 4 },
          { name: 'Victorian Poetry', code: '231111', credits: 4 },
          { name: 'Introduction to Literary Criticism (Up to Romantic Period)', code: '231113', credits: 4 },
          { name: 'Introduction to Linguistics', code: '231115', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Nineteenth Century Novel', code: '241101', credits: 4 },
          { name: 'Twentieth Century Poetry', code: '241103', credits: 4 },
          { name: 'Modern Drama', code: '241105', credits: 4 },
          { name: 'Twentieth Century Novel', code: '241107', credits: 4 },
          { name: 'American Poetry', code: '241109', credits: 4 },
          { name: 'American Literature: Fiction and  American Literature: Fiction and Drama', code: '241111', credits: 4 },
          { name: 'Classics in Translation', code: '241113', credits: 4 },
          { name: 'Literary Criticism (From Victorian to Modern Age)', code: '241115', credits: 4 },
          { name: 'Viva-voce', code: '241120', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Continental Literature', code: '241117', credits: 4 },
            { name: 'Approaches and Methods of Language Teaching', code: '241119', credits: 4 },
          ],
        },
      },
    ],
  },
  {
    id: 'History',
    bn: 'ইতিহাস',
    en: 'History',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introduction to History', code: '211503', credits: 4 },
          { name: 'History of Bengal (from earliest times to 1204)', code: '211505', credits: 4 },
          { name: 'History of South Asia upto 1526', code: '211507', credits: 4 },
          { name: 'Political and Cultural History of Islam upto 1258', code: '211509', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'History of South Asia, 1526-1757', code: '221501', credits: 4 },
          { name: 'History of Bengal, 1204-1765', code: '221503', credits: 4 },
          { name: 'History of Ancient Civilization', code: '221505', credits: 4 },
          { name: 'History of Medieval Civilization', code: '221507', credits: 4 },
          { name: 'Bangladesh Economy', code: '222209', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'History of Bengal, 1765-1905', code: '231501', credits: 4 },
          { name: 'History of South Asia, 1757-1857', code: '231503', credits: 4 },
          { name: 'History of West Asia, 1560 hrs.-1914', code: '231505', credits: 4 },
          { name: 'History of United States, 1776-1860 hrs.', code: '231507', credits: 4 },
          { name: 'History of England, 1485 to 1945', code: '231509', credits: 4 },
          { name: 'History of Africa Since Colonial Period', code: '231511', credits: 4 },
          { name: 'History of Europe, 1453-1815', code: '231513', credits: 4 },
          { name: 'Far East and South-East Asia in Modern Times', code: '231515', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'History of South Asia 1857-1947', code: '241501', credits: 4 },
          { name: 'History of Bengal 1905-1947', code: '241503', credits: 4 },
          { name: 'Constitutional History of India under British Colonial Rule 1773-1947', code: '241505', credits: 4 },
          { name: 'West Asia in Modern Times upto 1945', code: '241507', credits: 4 },
          { name: 'History of Russia and Soviet Union upto 1945', code: '241509', credits: 4 },
          { name: 'History of United States 1861-1945', code: '241511', credits: 4 },
          { name: 'History of Europe 1815-1939', code: '241513', credits: 4 },
          { name: 'Bangladesh: National Culture and Heritage', code: '241515', credits: 4 },
          { name: 'History of Resistance Movement and Subalterns (Selected Topics)', code: '241517', credits: 4 },
          { name: 'Viva-voce', code: '241518', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Islamic History and Culture',
    bn: 'ইসলামের ইতিহাস ও সংস্কৃতি',
    en: 'Islamic History and Culture',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'History of the Muslims (570-750, Prophet Muhammad (sm), Khulafa-i-Rashidun and the Umayyads)', code: '211601', credits: 4 },
          { name: 'History of The Muslims (750-1258, The Abbasids and the Regional Dynasties)', code: '211603', credits: 4 },
          { name: 'History of The Muslims in Spain (710-1492)', code: '211605', credits: 4 },
          { name: 'History of The Muslim Rule in Syria, Egypt and North Africa (Fatimids, Ayyubids and Mamluks)', code: '211607', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'History of the Muslims in India (upto 1526)', code: '221601', credits: 4 },
          { name: 'History of the Muslims in India (1526-1858)', code: '221603', credits: 4 },
          { name: 'History of Ancient Bengal (upto 1204)', code: '221605', credits: 4 },
          { name: 'History of Muslim rule in Bengal (1204 -1757)', code: '221607', credits: 4 },
          { name: 'Political Organization and The Political System of UK and USA', code: '221909', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'History of the Muslims in Persia and Central Asia (13th – 18th century)', code: '231601', credits: 4 },
          { name: 'History of the Ottomans (upto 1924)', code: '231603', credits: 4 },
          { name: 'History of Bengal (1757-1947)', code: '231605', credits: 4 },
          { name: 'History of Modern Europe (Since 1789)', code: '231607', credits: 4 },
          { name: 'Muslim Minorities in the Contemporary World', code: '231609', credits: 4 },
          { name: 'History of Muslim Administration (570-1258)', code: '231611', credits: 4 },
          { name: 'History of World Civilizations', code: '231613', credits: 4 },
          { name: 'Development of Religious Principles, Institutions, Literature and Science in Islam.', code: '231615', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Muslim Historiography (Khilafat; Sultanat and Mughal India)', code: '241601', credits: 4 },
          { name: 'Development of Philosophy and Sects in Islam', code: '241603', credits: 4 },
          { name: 'Development of Muslim Art and Painting', code: '241605', credits: 4 },
          { name: 'Development of Muslim Architecture and Archeology', code: '241607', credits: 4 },
          { name: 'History of Muslim Administration in India  (Sultanat and Mughal)', code: '241609', credits: 4 },
          { name: 'Economic History of Islam', code: '241611', credits: 4 },
          { name: 'History of the Muslims of Southeast Asia (upto 1824)', code: '241613', credits: 4 },
          { name: 'History of the Modern Muslim States', code: '241615', credits: 4 },
          { name: 'Political History of Bangladesh since 1971', code: '241617', credits: 4 },
          { name: 'Viva-voce', code: '241618', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Islamic Studies',
    bn: 'ইসলামিক স্টাডিজ',
    en: 'Islamic Studies',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Quranic Studies', code: '211801', credits: 4 },
          { name: 'Introduction to Islam', code: '211803', credits: 4 },
          { name: 'Introduction to Islamic Dawah', code: '211805', credits: 4 },
          { name: 'Al-Kalam', code: '211807', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Introductory Knowledge of Quran', code: '221801', credits: 4 },
          { name: 'Study of Al-Hadith', code: '221803', credits: 4 },
          { name: 'Al-Sirat al-Nabawiyya', code: '221805', credits: 4 },
          { name: 'Social System and Family Welfare in Islam', code: '221807', credits: 4 },
          { name: 'Political Organization and The Political System of UK and USA', code: '221909', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Study of al-Tafsir', code: '231801', credits: 4 },
          { name: 'Principles and History of Tafsir Literature', code: '231803', credits: 4 },
          { name: 'Muslim Philosophy and Philosophers', code: '231805', credits: 4 },
          { name: 'Sufism and some Prominent Sufis and their Contribution', code: '231807', credits: 4 },
          { name: 'Economic System in Islam', code: '231809', credits: 4 },
          { name: 'Study of Islamic Law, Personal Law and Law of Inheritance in Islam', code: '231811', credits: 4 },
          { name: 'Ethics and Values in Islam', code: '231813', credits: 4 },
          { name: 'History of Muslim World', code: '231815', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Sayings of the Holy Prophet (SM.) In the Practical Life', code: '241801', credits: 4 },
          { name: 'Principles and History of Hadith Literature', code: '241803', credits: 4 },
          { name: 'Principles and History of Islamic Jurisprudence', code: '241805', credits: 4 },
          { name: 'Political System in Islam', code: '241807', credits: 4 },
          { name: 'Study of Major Religions of the World', code: '241809', credits: 4 },
          { name: 'Banking  and Insurance in Islam', code: '241811', credits: 4 },
          { name: 'Muslims\' Contribution to Science & Technology', code: '241813', credits: 4 },
          { name: 'Islamic Civilization', code: '241815', credits: 4 },
          { name: 'Human Rights in Islam', code: '241817', credits: 4 },
          { name: 'Viva-Voce', code: '241818', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Library and Information Science',
    bn: 'লাইব্রেরি ও তথ্যবিজ্ঞান',
    en: 'Library and Information Science',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Foundations of Library and Information Science', code: '213801', credits: 4 },
          { name: 'Basics of Classification and Cataloguing', code: '213803', credits: 4 },
          { name: 'Introduction to Computer and Communication Technologies', code: '213805', credits: 4 },
          { name: 'Management of Library and Information Centre', code: '213807', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Records and Archives Management', code: '223801', credits: 4 },
          { name: 'Information Sources and Services', code: '223803', credits: 4 },
          { name: 'Information Resources Development', code: '223805', credits: 4 },
          { name: 'Information Resource Sharing', code: '223807', credits: 4 },
          { name: 'Political Organization and The Political System of UK and USA', code: '221909', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Information Networking and Resource Sharing', code: '233801', credits: 4 },
          { name: 'Database Design and Application', code: '233803', credits: 4 },
          { name: 'Documentation', code: '233805', credits: 4 },
          { name: 'International and Comparative Librarianship', code: '233807', credits: 4 },
          { name: 'Research Methodology and User Studies', code: '233809', credits: 4 },
          { name: 'Automation of Library and Information Centres', code: '233811', credits: 4 },
          { name: 'Indexing and Abstracting', code: '233813', credits: 4 },
          { name: 'Information and Communication', code: '233815', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Organization of Knowledge (Classification Theory)', code: '243801', credits: 4 },
          { name: 'Organization of Knowledge (Cataloguing Theory)', code: '243803', credits: 4 },
          { name: 'Systems Analysis and Design', code: '243805', credits: 4 },
          { name: 'New Technologies Current Trends in Information Systems', code: '243807', credits: 4 },
          { name: 'Information Production Marketing and Public Relation', code: '243809', credits: 4 },
          { name: 'Information Retrieval Techniques', code: '243811', credits: 4 },
          { name: 'Advanced Bibliography', code: '243813', credits: 4 },
          { name: 'Organization of Knowledge (Classification Practical)', code: '243814', credits: 3 },
          { name: 'Organization of Knowledge (Cataloguing Practical)', code: '243816', credits: 3 },
          { name: 'Computer Applications in Libraries (Practical)', code: '243820', credits: 2 },
          { name: 'Viva Voce', code: '243822', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Philosophy',
    bn: 'দর্শন',
    en: 'Philosophy',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Problems of Philosophy', code: '211701', credits: 4 },
          { name: 'History of Western Philosophy : Ancient and Medieval', code: '211703', credits: 4 },
          { name: 'General Ethics', code: '211705', credits: 4 },
          { name: 'Psychology', code: '211707', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'History of  Western Philosophy: Modern', code: '221701', credits: 4 },
          { name: 'Muslim Philosophy', code: '221703', credits: 4 },
          { name: 'Indian Philosophy: Atheistic School', code: '221705', credits: 4 },
          { name: 'General Logic', code: '221707', credits: 4 },
          { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
          { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          { name: 'Political Organization and The Political System of UK and USA', code: '221909', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Ancient Philosophical Classics : Plato and Aristotle', code: '231701', credits: 4 },
          { name: 'Modern Philosophical Classics : Hume and Kant', code: '231703', credits: 4 },
          { name: 'Symbolic Logic', code: '231705', credits: 4 },
          { name: 'Moral Philosophy of Immanuel Kant and J.S. Nill', code: '231707', credits: 4 },
          { name: 'Philosophy of the Bangalees : Ancient and Medieval', code: '231709', credits: 4 },
          { name: 'Muslim Philosophers', code: '231711', credits: 4 },
          { name: 'Indian Philosophy : Theistic School', code: '231713', credits: 4 },
          { name: 'Philosophy of Education', code: '231715', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Contemporary Western Philosophy', code: '241701', credits: 4 },
          { name: 'Marxist Philosophy', code: '241703', credits: 4 },
          { name: 'Aesthetics', code: '241705', credits: 4 },
          { name: 'Political Philosophy: Ancient and Medieval', code: '241707', credits: 4 },
          { name: 'Philosophy of the Bangalees: Modern and Contemporary', code: '241709', credits: 4 },
          { name: 'Philosophy of Mind', code: '241711', credits: 4 },
          { name: 'Social Philosophers', code: '241713', credits: 4 },
          { name: 'Meta Ethics', code: '241715', credits: 4 },
          { name: 'Philosophy of Religion', code: '241717', credits: 4 },
          { name: 'Viva-voce', code: '241718', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Sanskrit',
    bn: 'সংস্কৃত',
    en: 'Sanskrit',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Sanskrit Language -I', code: '211301', credits: 4 },
          { name: 'History of Vedic Literature', code: '211303', credits: 4 },
          { name: 'History of Sanskrit Literature', code: '211305', credits: 4 },
          { name: 'Sanskrit Story Literature', code: '211307', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introducing Sociology', code: '212009', credits: 4 },
            { name: 'Introduction to Social Work', code: '212111', credits: 4 },
            { name: 'Introduction to Political Theory', code: '211909', credits: 4 },
          ],
        },
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Sanskrit Language-2', code: '221301', credits: 4 },
          { name: 'Sanskrit Poetry', code: '221303', credits: 4 },
          { name: 'Sanskrit Prose', code: '221305', credits: 4 },
          { name: 'Sanskrit Poetics', code: '221307', credits: 4 },
          { name: 'Bangladesh Economy', code: '222209', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Sanskrit Grammar- I', code: '231301', credits: 4 },
          { name: 'Vedic Literature and Grammar', code: '231303', credits: 4 },
          { name: 'Sanskrit Drama (Kalidasa and Pre-Kalidasa)', code: '231305', credits: 4 },
          { name: 'Vedic and Sanskrit Prosody', code: '231307', credits: 4 },
          { name: 'Linguistics and Sanskrit Philology', code: '231309', credits: 4 },
          { name: 'Indian Philosophy', code: '231311', credits: 4 },
          { name: 'Ancient Indian History and Culture', code: '231313', credits: 4 },
          { name: 'Manuscript Studies', code: '231315', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Sanskrit Grammar-2', code: '241301', credits: 4 },
          { name: 'Sanskrit Epic', code: '241303', credits: 4 },
          { name: 'Purana and Philosophical Poem', code: '241305', credits: 4 },
          { name: 'Post-Kalidasa Sanskrit Drama', code: '241307', credits: 4 },
          { name: 'Sanskrit Ethical Poem', code: '241309', credits: 4 },
          { name: 'Sanskrit Historical Poem', code: '241311', credits: 4 },
          { name: 'Ancient Indian Politics', code: '241313', credits: 4 },
          { name: 'Archaeology of Bengal', code: '241315', credits: 4 },
          { name: 'Essay, Composition and Translation', code: '241317', credits: 4 },
          { name: 'Viva-voce', code: '241318', credits: 4 },
        ],
      },
    ],
  },
]

const BSS_DEPTS: NuDept[] = [
  {
    id: 'Anthropology',
    bn: 'নৃবিজ্ঞান',
    en: 'Anthropology',
    years: [
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Early Anthropological Theory', code: '224001', credits: 4 },
          { name: 'Research Methodology-I', code: '224003', credits: 4 },
          { name: 'Economic Anthropology', code: '224005', credits: 4 },
          { name: 'European Social History and Culture', code: '224007', credits: 4 },
          { name: 'Bangladesh Economy', code: '222209', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Anthropological Theory-II', code: '234001', credits: 4 },
          { name: 'Political Anthropology', code: '234003', credits: 4 },
          { name: 'Peasant Society', code: '234005', credits: 4 },
          { name: 'Religion and Anthropology', code: '234007', credits: 4 },
          { name: 'Environmental Anthropology', code: '234009', credits: 4 },
          { name: 'Gender Issues', code: '234011', credits: 4 },
          { name: 'Ethnic Identity and Nationalism', code: '234013', credits: 4 },
          { name: 'Reading Ethnographic Texts', code: '234015', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Contemporary Anthropological Theory', code: '244001', credits: 4 },
          { name: 'Research Methods-II', code: '244003', credits: 4 },
          { name: 'Anthropology of Development', code: '244005', credits: 4 },
          { name: 'Medical Anthropology', code: '244007', credits: 4 },
          { name: 'Urban Anthropology', code: '244009', credits: 4 },
          { name: 'South Asian Society and Culture', code: '244011', credits: 4 },
          { name: 'Language, Society and Culture', code: '244013', credits: 4 },
          { name: 'Social Inequality', code: '244015', credits: 4 },
          { name: 'Emerging Issues in Anthropology', code: '244017', credits: 4 },
          { name: 'Viva-voce', code: '244018', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Economics',
    bn: 'অর্থনীতি',
    en: 'Economics',
    years: [
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Intermediate Microeconomics', code: '222201', credits: 4 },
          { name: 'Mathematical Economics', code: '222203', credits: 4 },
          { name: 'Introduction to Business (In English/Bengali)', code: '222205', credits: 4 },
          { name: 'Computer and Information Technology', code: '222207', credits: 4 },
          { name: 'Political Organization And Political System Of UK and USA', code: '221909', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society an Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Intermediate Macroeconomics', code: '232201', credits: 4 },
          { name: 'Statistics for Economics', code: '232203', credits: 4 },
          { name: 'Studies on Bangladesh Economy', code: '232205', credits: 4 },
          { name: 'Development of Economics', code: '232207', credits: 4 },
          { name: 'International Economics-I', code: '232209', credits: 4 },
          { name: 'Public Finance', code: '232211', credits: 4 },
          { name: 'Urban Economics', code: '232213', credits: 4 },
          { name: 'Agricultural and Rural Economics', code: '232215', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Money, Banking and Finance', code: '242201', credits: 4 },
          { name: 'International Economics-II', code: '242203', credits: 4 },
          { name: 'Research Methodology', code: '242205', credits: 4 },
          { name: 'Industrial Economics', code: '242207', credits: 4 },
          { name: 'Environmental  and Resource Economics', code: '242209', credits: 4 },
          { name: 'Population and Health Economics', code: '242211', credits: 4 },
          { name: 'Economic Thought', code: '242213', credits: 4 },
          { name: 'Viva-voce', code: '242222', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 2টি)',
          en: 'Optional Subjects (any 2)',
          limit: 2,
          courses: [
            { name: 'Econometrics', code: '242215', credits: 4 },
            { name: 'Economic Systems and Development Patterns', code: '242217', credits: 4 },
            { name: 'Economics of Planning', code: '242219', credits: 4 },
            { name: 'Islamic Economics', code: '242221', credits: 4 },
          ],
        },
      },
    ],
  },
  {
    id: 'Political Science',
    bn: 'রাষ্ট্রবিজ্ঞান',
    en: 'Political Science',
    years: [
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Political and Constitutional Development in British India (1757 to 1947)', code: '221901', credits: 4 },
          { name: 'Political Economy of Bangladesh', code: '221903', credits: 4 },
          { name: 'Women in Politics and Development', code: '221905', credits: 4 },
          { name: 'Oriental Political Thought', code: '221907', credits: 4 },
          { name: 'Bangladesh Economy', code: '222209', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Sociology of Bangladesh', code: '222009', credits: 4 },
            { name: 'Bangladesh Society and Culture', code: '222115', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Political and Constitutional Development in Bangladesh (1971 to date)', code: '231901', credits: 4 },
          { name: 'Fundamentals of International Politics', code: '231903', credits: 4 },
          { name: 'Government and Politics in South Asia: India, Pakistan, Nepal and SriLanka', code: '231905', credits: 4 },
          { name: 'Approaches to the Study of Politics', code: '231907', credits: 4 },
          { name: 'Introduction to Peace and Conflict Studies', code: '231909', credits: 4 },
          { name: 'Public Administration in Bangladesh', code: '231911', credits: 4 },
          { name: 'Research Methodology and Statistics', code: '231913', credits: 4 },
          { name: 'Political Sociology', code: '231915', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Political Theories: Changes and Continuities', code: '241901', credits: 4 },
          { name: 'Local Government and Rural Development in Bangladesh', code: '241903', credits: 4 },
          { name: 'Introduction to Public Policy', code: '241905', credits: 4 },
          { name: 'Government and Politics in East Asia: China, Japan and South Korea', code: '241907', credits: 4 },
          { name: 'Environment and Development', code: '241909', credits: 4 },
          { name: 'Foreign Relations of Bangladesh', code: '241911', credits: 4 },
          { name: 'Legislative Process in Bangladesh', code: '241913', credits: 4 },
          { name: 'Globalization, Regionalism and International Financial Institutions', code: '241915', credits: 4 },
          { name: 'Modern Political Thought', code: '241917', credits: 4 },
          { name: 'Viva-voce', code: '241918', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Social Work',
    bn: 'সমাজকর্ম',
    en: 'Social Work',
    years: [
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Human Biology: Growth and Development', code: '222101', credits: 4 },
          { name: 'Social Policy and Planning', code: '222103', credits: 4 },
          { name: 'Social Problems Analysis', code: '222105', credits: 4 },
          { name: 'Introduction to Anthropology', code: '222107', credits: 4 },
          { name: 'Computer and Information Technology', code: '222109', credits: 4 },
        ],
        optional: {
          bn: 'ঐচ্ছিক বিষয় (যেকোনো 1টি)',
          en: 'Optional Subjects (any 1)',
          limit: 1,
          courses: [
            { name: 'Introduction to Sociology', code: '222111', credits: 4 },
            { name: 'Bangladesh Economy', code: '222113', credits: 4 },
          ],
        },
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Social Work Methods: Case work and Group work', code: '232101', credits: 4 },
          { name: 'Theories in Social Work Practice', code: '232103', credits: 4 },
          { name: 'Voluntarism and NGOs in Bangladesh', code: '232105', credits: 4 },
          { name: 'Working with the Poor: Policy and Practice', code: '232107', credits: 4 },
          { name: 'Project Planning and Management', code: '232109', credits: 4 },
          { name: 'Population Issues, Policy Planning and Services', code: '232111', credits: 4 },
          { name: 'Human Rights, Social Justice and Social Work', code: '232113', credits: 4 },
          { name: 'Crime and Society', code: '232115', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Rural and Urban Community Development', code: '242101', credits: 4 },
          { name: 'Climate Change: Issues and Disaster Management', code: '242103', credits: 4 },
          { name: 'Human Resource Management', code: '242105', credits: 4 },
          { name: 'Social Research and Statistics', code: '242107', credits: 4 },
          { name: 'Social Services in Bangladesh', code: '242109', credits: 4 },
          { name: 'Social Work and Globalization', code: '242111', credits: 4 },
          { name: 'Public Health and Social Work', code: '242113', credits: 4 },
          { name: 'Social Action, Social Legislation and Social Work', code: '242115', credits: 4 },
          { name: 'Field Work Education', code: '242117', credits: 4 },
          { name: 'Field Practicum+Viva-voce', code: '242118', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Sociology',
    bn: 'সমাজবিজ্ঞান',
    en: 'Sociology',
    years: [
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Introductory Anthropology', code: '222001', credits: 4 },
          { name: 'Classical Social Thought', code: '222003', credits: 4 },
          { name: 'Social Statistics', code: '222005', credits: 4 },
          { name: 'Research Methodology', code: '222007', credits: 4 },
          { name: 'Political Organization And Political System Of UK And USA', code: '221909', credits: 4 },
          { name: 'Bangladesh Economy', code: '222209', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Classical Sociological Theory', code: '232001', credits: 4 },
          { name: 'Rural Sociology', code: '232003', credits: 4 },
          { name: 'Sociology of Religion', code: '232005', credits: 4 },
          { name: 'Social Inequality', code: '232007', credits: 4 },
          { name: 'Societies and Communities', code: '232009', credits: 4 },
          { name: 'Social Structure of Bangladesh', code: '232011', credits: 4 },
          { name: 'Urban Sociology', code: '232013', credits: 4 },
          { name: 'Social Psychology', code: '232015', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Gender, Society and Development', code: '242001', credits: 4 },
          { name: 'Sociology of Development', code: '242003', credits: 4 },
          { name: 'Social Demography', code: '242005', credits: 4 },
          { name: 'Sociology of Environment', code: '242007', credits: 4 },
          { name: 'Sociology of Bangladesh', code: '242009', credits: 4 },
          { name: 'Social Change', code: '242011', credits: 4 },
          { name: 'Deviance and Crime', code: '242013', credits: 4 },
          { name: 'Industrial Sociology', code: '242015', credits: 4 },
          { name: 'Peasant Society', code: '242017', credits: 4 },
          { name: 'Viva-voce', code: '242018', credits: 4 },
        ],
      },
    ],
  },
]

const BBA_DEPTS: NuDept[] = [
  {
    id: 'Accounting',
    bn: 'হিসাববিজ্ঞান',
    en: 'Accounting',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Principles of Accounting', code: '212501', credits: 4 },
          { name: 'Principles of Finance', code: '212503', credits: 4 },
          { name: 'Principles of Marketing', code: '212505', credits: 4 },
          { name: 'Principles of Management', code: '212507', credits: 4 },
          { name: 'Micro Economics', code: '212509', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Computer Information Technology (Accounting)', code: '222501', credits: 4 },
          { name: 'Taxation in Bangladesh', code: '222503', credits: 4 },
          { name: 'Intermediate Accounting', code: '222505', credits: 4 },
          { name: 'Business Mathematics', code: '222507', credits: 4 },
          { name: 'Business Statistics', code: '222509', credits: 4 },
          { name: 'Macro Economics', code: '222511', credits: 4 },
          { name: 'Business Communication and Report Writing', code: '222513', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Audit and Assurance', code: '232501', credits: 4 },
          { name: 'Advanced Accounting-I', code: '232503', credits: 4 },
          { name: 'Cost Accounting', code: '232505', credits: 4 },
          { name: 'Management Accounting (In English)', code: '232507', credits: 4 },
          { name: 'Business and Commercial Laws', code: '232509', credits: 4 },
          { name: 'Entrepreneurship', code: '232511', credits: 4 },
          { name: 'Financial Management', code: '232513', credits: 4 },
          { name: 'Banking and Insurance Theories, Laws and Accounts', code: '232515', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Accounting Theory', code: '242501', credits: 4 },
          { name: 'Advanced Auditing & Professional Ethics', code: '242503', credits: 4 },
          { name: 'Accounting Information Systems', code: '242505', credits: 4 },
          { name: 'Organizational Behavior', code: '242507', credits: 4 },
          { name: 'Corporate Law and Practices', code: '242509', credits: 4 },
          { name: 'Working Capital Management And Financial Statement Analysis', code: '242511', credits: 4 },
          { name: 'Advanced Accounting-II', code: '242513', credits: 4 },
          { name: 'Investment Analysis and Portfolio Management', code: '242515', credits: 4 },
          { name: 'Research Methodology (In English)', code: '242517', credits: 4 },
          { name: 'Viva-voce', code: '242518', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Finance and Banking',
    bn: 'ফিন্যান্স ও ব্যাংকিং',
    en: 'Finance and Banking',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Principles of Accounting', code: '212401', credits: 4 },
          { name: 'Principles of Finance', code: '212403', credits: 4 },
          { name: 'Principles of Marketing', code: '212405', credits: 4 },
          { name: 'Principles of Management', code: '212407', credits: 4 },
          { name: 'Micro Economics', code: '212409', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Business Statistics', code: '222401', credits: 4 },
          { name: 'Macro Economics', code: '222403', credits: 4 },
          { name: 'Business Mathematics', code: '222405', credits: 4 },
          { name: 'Law and Practices of Banking and Insurance', code: '222407', credits: 4 },
          { name: 'Computer and Information Technology', code: '222409', credits: 4 },
          { name: 'Legal Aspects of Business', code: '222411', credits: 4 },
          { name: 'Business Communication and Report Writing', code: '222413', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Portfolio Management', code: '232401', credits: 4 },
          { name: 'Financial Analysis & Control', code: '232403', credits: 4 },
          { name: 'Entrepreneurship', code: '232405', credits: 4 },
          { name: 'Management  Accounting', code: '232407', credits: 4 },
          { name: 'Auditing', code: '232409', credits: 4 },
          { name: 'Islamic Banking', code: '232411', credits: 4 },
          { name: 'Marketing of Financial Service', code: '232413', credits: 4 },
          { name: 'Financial Management', code: '232415', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'International Trade and Finance', code: '242401', credits: 4 },
          { name: 'Public Finance and Taxation', code: '242403', credits: 4 },
          { name: 'Financial Market and Institutions', code: '242405', credits: 4 },
          { name: 'Comparative Financial System', code: '242407', credits: 4 },
          { name: 'Human Resource Management', code: '242409', credits: 4 },
          { name: 'Business Research Methodology', code: '242411', credits: 4 },
          { name: 'SME and Micro Finance', code: '242413', credits: 4 },
          { name: 'E-Banking & E-Commerce', code: '242415', credits: 4 },
          { name: 'Central Banking', code: '242417', credits: 4 },
          { name: 'Viva-Voce', code: '242418', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Management',
    bn: 'ব্যবস্থাপনা',
    en: 'Management',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introduction to Business', code: '212601', credits: 4 },
          { name: 'Principles of Management', code: '212603', credits: 4 },
          { name: 'Principles of Accounting', code: '212605', credits: 4 },
          { name: 'Principles of Marketing', code: '212607', credits: 4 },
          { name: 'Micro-Economics', code: '212609', credits: 4 },
          { name: 'History of the Emergence of Independent Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Human Resource Management', code: '222601', credits: 4 },
          { name: 'Business Communication (In English)', code: '222603', credits: 4 },
          { name: 'Legal Environment of Business', code: '222605', credits: 4 },
          { name: 'Principles of Finance', code: '222607', credits: 4 },
          { name: 'Business Mathematics', code: '222609', credits: 4 },
          { name: 'Computer and Information Technology', code: '222611', credits: 4 },
          { name: 'Macro Economics', code: '222613', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Operations Management', code: '232601', credits: 4 },
          { name: 'Business Statistics (In English)', code: '232603', credits: 4 },
          { name: 'Organizational Behavior', code: '232605', credits: 4 },
          { name: 'Taxation in Bangladesh', code: '232607', credits: 4 },
          { name: 'Insurance & Risk Management', code: '232609', credits: 4 },
          { name: 'Company Law', code: '232611', credits: 4 },
          { name: 'Management Accounting (In English)', code: '232613', credits: 4 },
          { name: 'Marketing Management', code: '232615', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Bank Management', code: '242601', credits: 4 },
          { name: 'Financial Management (In English)', code: '242603', credits: 4 },
          { name: 'Supply Chain Management', code: '242605', credits: 4 },
          { name: 'Industrial Relations', code: '242607', credits: 4 },
          { name: 'Project Management', code: '242609', credits: 4 },
          { name: 'International Trade', code: '242611', credits: 4 },
          { name: 'Investment Management', code: '242613', credits: 4 },
          { name: 'Bangladesh Economy', code: '242615', credits: 4 },
          { name: 'Entrepreneurship', code: '242617', credits: 4 },
          { name: 'Viva-voce', code: '242618', credits: 4 },
        ],
      },
    ],
  },
  {
    id: 'Marketing',
    bn: 'মার্কেটিং',
    en: 'Marketing',
    years: [
      {
        bn: '১ম বর্ষ', en: '1st Year',
        courses: [
          { name: 'Introduction to Business', code: '212301', credits: 4 },
          { name: 'Principles of Marketing-I', code: '212303', credits: 4 },
          { name: 'Financial Accounting', code: '212305', credits: 4 },
          { name: 'Principles of Management', code: '212307', credits: 4 },
          { name: 'Introduction to Computer', code: '212309', credits: 4 },
          { name: 'History of the Emergence Independent of Bangladesh', code: '211501', credits: 4 },
        ],
      },
      {
        bn: '২য় বর্ষ', en: '2nd Year',
        courses: [
          { name: 'Business Communication', code: '222301', credits: 4 },
          { name: 'Fundamentals of Finance', code: '222303', credits: 4 },
          { name: 'Business Statistics- I', code: '222305', credits: 4 },
          { name: 'Business Mathmetics', code: '222307', credits: 4 },
          { name: 'Insurance and Risk Management', code: '222309', credits: 4 },
          { name: 'Micro Economics', code: '222311', credits: 4 },
          { name: 'Agricultural Marketing', code: '222313', credits: 4 },
        ],
      },
      {
        bn: '৩য় বর্ষ', en: '3rd Year',
        courses: [
          { name: 'Principles of Marketing-II', code: '232301', credits: 4 },
          { name: 'Organizational Behavior', code: '232303', credits: 4 },
          { name: 'Financial Management', code: '232305', credits: 4 },
          { name: 'Business Statistics-II', code: '232307', credits: 4 },
          { name: 'Advertising & Promotion', code: '232309', credits: 4 },
          { name: 'Legal Aspects of Marketing', code: '232311', credits: 4 },
          { name: 'Macro Economics', code: '232313', credits: 4 },
          { name: 'Taxation in Bangladesh', code: '232315', credits: 4 },
        ],
      },
      {
        bn: '৪র্থ বর্ষ', en: '4th Year',
        courses: [
          { name: 'Marketing Management', code: '242301', credits: 4 },
          { name: 'Human Resource Management', code: '242303', credits: 4 },
          { name: 'International Business', code: '242305', credits: 4 },
          { name: 'Consumer Behavior', code: '242307', credits: 4 },
          { name: 'Sales Management', code: '242309', credits: 4 },
          { name: 'Brand Management', code: '242311', credits: 4 },
          { name: 'Entrepreneurship Development', code: '242313', credits: 4 },
          { name: 'Bangladesh Economics', code: '242315', credits: 4 },
          { name: 'Marketing Research', code: '242317', credits: 4 },
          { name: 'Viva- voce', code: '242318', credits: 4 },
        ],
      },
    ],
  },
]

export const NU_PROGRAMS: NuProgram[] = [
  { id: 'BSc', bn: 'বিএসসি (BSc)', en: 'BSc', depts: BSc_DEPTS },
  { id: 'BA', bn: 'বিএ (BA)', en: 'BA', depts: BA_DEPTS },
  { id: 'BSS', bn: 'বিএসএস (BSS)', en: 'BSS', depts: BSS_DEPTS },
  { id: 'BBA', bn: 'বিবিএ (BBA)', en: 'BBA', depts: BBA_DEPTS },
]

/** জাতীয় বিশ্ববিদ্যালয় গ্রেডিং সিস্টেম (৪.০০ স্কেল) */
export const NU_GRADING: { grade: string; point: number; range: string }[] = [
  { grade: 'A+', point: 4.0, range: '80% and above' },
  { grade: 'A', point: 3.75, range: '75% to less than 80%' },
  { grade: 'A-', point: 3.5, range: '70% to less than 75%' },
  { grade: 'B+', point: 3.25, range: '65% to less than 70%' },
  { grade: 'B', point: 3.0, range: '60% to less than 65%' },
  { grade: 'B-', point: 2.75, range: '55% to less than 60%' },
  { grade: 'C+', point: 2.5, range: '50% to less than 55%' },
  { grade: 'C', point: 2.25, range: '45% to less than 50%' },
  { grade: 'D', point: 2.0, range: '40% to less than 45%' },
  { grade: 'F', point: 0.0, range: 'Less than 40%' },
]

/** গ্রেড অক্ষর থেকে পয়েন্ট */
export function pointOf(grade: string): number {
  return NU_GRADING.find((g) => g.grade === grade)?.point ?? 0
}
