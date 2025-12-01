export type RESTWhereField = {
    field: string;
    op: 'equals' | 'in' | 'is_not' | 'like' | 'gt' | 'lt' | 'gte' | 'lte' | 'json_extract';
    value: any;
    json_path?: string;
};

export type RESTCastOptions = { type: 'json' | 'embedding'; default?: any };

export type RESTSelect = {
    type?: 'select';
    table: string;
    joins?: {
        table: string;
        on: {
            left: string;
            right: string;
        };
    }[];
    where?: RESTWhereField[];
    select?: (string | {expression: string, alias?: string})[];
    limit?: number;
    order_by?: {
        field: string;
        direction: 'ASC' | 'DESC';
    };
    expect?: { is: 'single', value_when_no_item?: any };
    cast?: Record<string, RESTCastOptions>;
};

export type RESTInsert = {
    type: 'insert';
    table: string;
    values: Record<string, any> | Record<string, any>[];
    cast?: Record<string, RESTCastOptions>;
};

export type RESTUpdate = {
    type: 'update';
    table: string;
    where: RESTWhereField[];
    values: Record<string, any>;
    cast?: Record<string, RESTCastOptions>;
};

export type RESTDelete = {
    type: 'delete';
    table: string;
    where: RESTWhereField[];
    cast?: Record<string, RESTCastOptions>;
};

export type RESTQuery = RESTSelect | RESTInsert | RESTUpdate | RESTDelete;