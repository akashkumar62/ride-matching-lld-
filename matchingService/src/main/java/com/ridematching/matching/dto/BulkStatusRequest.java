package com.ridematching.matching.dto;

import java.util.List;

public record BulkStatusRequest(

        List<String> emails

) {
}
