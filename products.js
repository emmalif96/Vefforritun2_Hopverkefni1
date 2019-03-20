const xss = require('xss');
const isISO8601 = require('validator/lib/isISO8601');
const { query } = require('./db');

function isEmpty(s) {
  return s == null && !s;
}

function validate({ title, price, text, imgurl, category } = {}, isProduct = false) {
  const errors = [];
  if (isProduct) {
    if (title === undefined
      || price === undefined
      || text === undefined
      || category === undefined) {
      errors.push({
        field: 'error',
        message: 'Ný vara verður að innihalda titil, verð, texta og flokk',
      });
    }
  }

  if (!isEmpty(title)) {
    if (typeof title !== 'string' || title.length < 1 || title.length > 128) {
      errors.push({
        field: 'title',
        message: 'Titill verður að vera strengur sem er 1 til 128 stafir',
      });
    }
  }

  if (!isEmpty(price)) {
    if (typeof price !== 'number' || Number(price) < 0) {
      errors.push({
        field: 'price',
        message: 'Verð verður að vera heiltala stærri eða jöfn 0',
      });
    }
  }

  if (!isEmpty(text)) {
    if (typeof text !== 'string' || text.length < 1 || text.length > 512) {
      errors.push({
        field: 'text',
        message: 'Texti verður að vera strengur sem er 1 til 512 stafir',
      });
    }
  }

  if (!isEmpty(imgurl)) {
    if (typeof imgurl !== 'string') {
      errors.push({
        field: 'imgurl',
        message: 'Slóð að mynd verður að vera strengur',
      });
    }
  }

  if (!isEmpty(category)) {
    if (typeof category !== 'string' || category.length < 1 || category.length > 128) {
      errors.push({
        field: 'category',
        message: 'Heiti á flokki verður að vera strengur sem er 1 til 128 stafir',
      });
    }
  }

  return errors;
}

async function getProducts(order = 'asc', category = undefined) {
  let result;

  const orderString = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  if (category !== undefined) {
    const q = `
    SELECT *
    FROM products
    WHERE category = $1
    ORDER BY date`;

    result = await query(q, [category]);
  } else {
    const q = `
    SELECT *
    FROM products
    ORDER BY date ${orderString}`;

    result = await query(q);
  }

  return result.rows;
}

// Sækir vöru eftir product id
async function getProductId(id) {
  const q = 'SELECT * FROM products WHERE product_no = $1';

  let result = null;

  try {
    result = await query(q, [id]);
  } catch (e) {
    console.warn('Error fetching todo', e);
  }

  if (!result || result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function createProduct({ title, price, text, imgurl, category } = {}) {
  // athuga hvort inntak sé leyfilegt
  const validation = validate({ title, price, text, imgurl, category }, true);

  // ef ekki leyfilegt þá skila error
  if (validation.length > 0) {
    return {
      success: false,
      notFound: false,
      validation,
      item: null,
    };
  }

  // athuga hvort flokkur sé til
  const q1 = 'SELECT * FROM categories WHERE category = $1';
  const checkCategoryName = await query(q1, [category]);

  // ef flokkur ekki til þá skila error
  if (checkCategoryName.rows.length === 0) {
    return {
      success: false,
      existingCategory: false,
      validation,
      item: null,
    };
  }

  // athuga hvort vara sé til
  const q2 = 'SELECT * FROM products WHERE title = $1';
  const checkProductName = await query(q2, [title]);

  // ef vara er til þá skila error
  if (checkProductName.rows.length > 0) {
    return {
      success: false,
      existingProduct: true,
      validation,
      item: null,
    };
  }

  const columns = [
    'title',
    'price',
    'text',
    imgurl ? 'imgurl' : null,
    'category',
  ].filter(Boolean);

  const values = [
    xss(title),
    xss(price),
    xss(text),
    imgurl ? xss(imgurl) : null,
    xss(category),
  ].filter(Boolean);

  const params = values.map((_, i) => `$${i + 1}`);

  const sqlQuery = `
    INSERT INTO products (${columns.join(',')})
    VALUES (${params})
    RETURNING *`;

  const result = await query(sqlQuery, values);

  return {
    success: true,
    notFound: false,
    validation: [],
    item: result.rows[0],
  };
}

async function updateProduct(id, { title, price, text, imgurl, category }) {
  // athuga hvort flokkur sé til
  const q1 = 'SELECT * FROM categories WHERE category = $1';
  const checkCategoryName = await query(q1, [category]);

  // ef flokkur ekki til þá skila error
  if (checkCategoryName.rows.length > 0) {
    return {
      success: false,
      existing: false,
      validate,
      item: null,
    };
  }

  // athuga hvort vara sé til
  const q2 = 'SELECT * FROM products WHERE title = $1';
  const checkProductName = await query(q2, [title]);

  // ef vara er til þá skila error
  if (checkProductName.rows.length > 0) {
    return {
      success: false,
      existing: true,
      validate,
      item: null,
    };
  }

  // athuga hvort inntak sé leyfilegt
  const validation = validate({ title, price, text, imgurl, category });

  // ef ekki leyfilegt þá skila error
  if (validation.length > 0) {
    return {
      success: false,
      notFound: false,
      validation,
      item: null,
    };
  }

  const filteredValues = [
    xss(title),
    xss(price),
    xss(text),
    imgurl ? xss(imgurl) : null,
    xss(category),
  ]
    .filter(Boolean);

  const updates = [
    title ? 'title' : null,
    price ? 'price' : null,
    text ? 'text' : null,
    imgurl ? 'imgurl' : null,
    category ? 'category' : null,
  ]
    .filter(Boolean)
    .map((field, i) => `${field} = $${i + 2}`);

  const sqlQuery = `
  UPDATE products
  SET ${updates} WHERE product_no = $1
  RETURNING *`;
  const values = [id, ...filteredValues];

  const result = await query(sqlQuery, values);

  if (result.rowCount === 0) {
    return {
      success: false,
      validation: [],
      notFound: true,
      item: null,
    };
  }

  return {
    success: true,
    validation: [],
    notFound: false,
    item: result.rows[0],
  };
}

async function deleteProduct(id) {
  const q = 'DELETE FROM products WHERE product_no = $1';
  const result = await query(q, [id]);

  return result.rowCount === 1;
}

// sækir lista af flokkum
async function getCategories() {
  const q = 'SELECT * FROM categories ORDER BY id';
  const result = await query(q);

  return result.rows;
}

async function getCategoriesId(id) {
  const q = 'SELECT * FROM categories WHERE id = $1';
  let result = null;

  try {
    result = await query(q, [id]);
  } catch (e) {
    console.warn('Error fetching todo', e);
  }

  if (!result || result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function createCategory({ category } = {}) {
  if (category === undefined) {
    const validation = [];
    validation.push({
      field: 'category',
      message: 'Heiti á flokki verður að vera strengur sem er 1 til 128 stafir',
    });

    return {
      success: false,
      notFound: false,
      validation,
      item: null,
    };
  }

  // athuga hvort inntak sé leyfilegt
  const validation = validate({ category });

  // ef ekki leyfilegt þá skila error
  if (validation.length > 0) {
    return {
      success: false,
      notFound: false,
      validation,
      item: null,
    };
  }

  // athuga hvort flokkur sé til
  const q = 'SELECT * FROM categories WHERE category = $1';
  const check = await query(q, [category]);

  // ef flokkur er til þá skila error
  if (check.rows.length > 0) {
    return {
      success: false,
      notFound: false,
      existing: true,
      item: null,
    };
  }

  const columns = [
    'category',
  ].filter(Boolean);

  const values = [
    xss(category),
  ].filter(Boolean);

  const params = values.map((_, i) => `$${i + 1}`);

  const sqlQuery = `
    INSERT INTO categories (${columns.join(',')})
    VALUES (${params})
    RETURNING *`;

  const result = await query(sqlQuery, values);

  return {
    success: true,
    notFound: false,
    validation: [],
    item: result.rows[0],
  };
}

async function updateCategory(id, { category }) {
  const validation = validate({ category }, false);

  if (validation.length > 0) {
    return {
      success: false,
      validation,
    };
  }

  // athuga hvort flokkur sé til
  const q = 'SELECT * FROM categories WHERE category = $1';
  const check = await query(q, [category]);

  // ef flokkur er til þá skila error
  if (check.rows.length > 0) {
    return {
      success: false,
      existing: true,
      validation,
      item: null,
    };
  }

  const filteredValues = [
    xss(category),
  ]
    .filter(Boolean);

  const updates = [
    'category',
  ]
    .filter(Boolean)
    .map((field, i) => `${field} = $${i + 2}`);

  const sqlQuery = `
  UPDATE categories
  SET ${updates} WHERE id = $1
  RETURNING *`;
  const values = [id, ...filteredValues];

  const result = await query(sqlQuery, values);

  if (result.rowCount === 0) {
    return {
      success: false,
      validation,
      notFound: true,
      item: null,
    };
  }

  return {
    success: true,
    validation,
    notFound: false,
    item: result.rows[0],
  };
}

async function deleteCategory(id, category) {
 /*  const q1 = 'SELECT FROM products WHERE category = $1';
  const findItems = await query(q1);

  const q2 = 'DELETE FROM products WHERE category = $1';

  const deleteItems = await query(q2, [category]); */

  const q3 = 'DELETE FROM categories WHERE id = $1';

  const result = await query(q3, [id]);

  return result.rowCount === 1;
}

// aðferðir sem kallað er í úr app.js
async function productsGet(req, res) {
  const { order, category } = req.query;

  const result = await getProducts(order, category);

  return res.json(result);
}

async function productsGetId(req, res) {
  const { id } = req.params;

  const result = await getProductId(id);

  if (result) {
    return res.json(result);
  }

  return res.status(404).json({ error: 'Item not found' });
}

async function productsPost(req, res) {
  const { title, price, text, imgurl, category } = req.body;

  const result = await createProduct({ title, price, text, imgurl, category });

  if (!result.success && result.existingProduct) {
    return res.status(400).json({ error: 'Product already exists' });
  }

  if (!result.success && !result.existingCategory && result.validation.length === 0) {
    return res.status(400).json({ error: 'Category does not exist' });
  }

  if (!result.success) {
    return res.status(400).json(result.validation);
  }

  return res.status(201).json(result.item);
}

async function productsPatch(req, res) {
  const { id } = req.params;
  const { title, price, text, imgurl, category } = req.body;

  const item = { title, price, text, imgurl, category };

  const result = await updateProduct(id, item);

  if (!result.success && result.validation.length > 0) {
    return res.status(400).json(result.validation);
  }

  if (!result.success && result.notFound) {
    return res.status(404).json({ error: 'Item not found' });
  }

  return res.status(201).json(result.item);
}

async function productsDelete(req, res) {
  const { id } = req.params;

  const deleted = await deleteProduct(id);

  if (deleted) {
    return res.status(204).json({});
  }

  return res.status(404).json({ error: 'Item not found' });
}

async function categoriesGet(req, res) {
  const result = await getCategories();

  return res.json(result);
}

async function categoriesGetId(req, res) {
  const { id } = req.params;

  const result = await getCategoriesId(id);

  if (result) {
    return res.json(result);
  }

  return res.status(404).json({ error: 'Item not found' });
}

async function categoriesPost(req, res) {
  const { category } = req.body;

  const result = await createCategory({ category });

  if (result.existing) {
    return res.status(400).json({ error: 'Category already exists' });
  }

  if (!result.success) {
    return res.status(400).json(result.validation);
  }

  return res.status(201).json(result.item);
}

async function categoriesPatch(req, res) {
  const { id } = req.params;
  const { category } = req.body;

  const item = { category };

  const result = await updateCategory(id, item);

  if (!result.success && result.existing) {
    return res.status(400).json({ error: 'Category already exists' });
  }

  if (!result.success && result.validation.length > 0) {
    return res.status(400).json(result.validation);
  }

  if (!result.success && result.notFound) {
    return res.status(404).json({ error: 'Item not found' });
  }

  return res.status(201).json(result.item);
}

async function categoriesDelete(req, res) {
  const { id } = req.params;

  const deleted = await deleteCategory(id);

  if (deleted) {
    return res.status(204).json({});
  }

  return res.status(404).json({ error: 'Item not found' });
}

module.exports = {
  productsGet,
  productsGetId,
  productsPost,
  productsPatch,
  productsDelete,
  categoriesGet,
  categoriesGetId,
  categoriesPost,
  categoriesPatch,
  categoriesDelete,
};