package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.dto.FieldMappingDtos.*;
import com.technomile.erpconfigapi.entity.FieldMapping;
import com.technomile.erpconfigapi.repository.FieldMappingRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FieldMappingServiceTest {

    @Mock
    private FieldMappingRepository fieldMappingRepository;
    @Mock
    private StepService stepService;

    @InjectMocks
    private FieldMappingService fieldMappingService;

    @Test
    void createShouldFailWhenAlreadyMapped() {
        when(fieldMappingRepository.findByStepPkAndArrayTargetPathAndTargetPath(1L, "", "target")).thenReturn(Optional.of(new FieldMapping()));

        AppException ex = assertThrows(AppException.class,
                () -> fieldMappingService.create(new FieldMappingCreateDto(1L, "src", "target", null, null, null, null, null, null, null, null, null)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createShouldSetDefaults() {
        when(fieldMappingRepository.findByStepPkAndArrayTargetPathAndTargetPath(1L, "", "target")).thenReturn(Optional.empty());
        when(fieldMappingRepository.save(any(FieldMapping.class))).thenAnswer(i -> {
            FieldMapping fm = i.getArgument(0);
            fm.setMappingPk(7L);
            return fm;
        });

        var out = fieldMappingService.create(new FieldMappingCreateDto(1L, "src", "target", null, null, null, null, null, null, null, null, null));

        assertEquals("none", out.transform_type());
        assertFalse(out.is_required());
        assertEquals(0, out.sort_order());
    }

    @Test
    void createBulkShouldFailOnDuplicateInBody() {
        var row1 = new FieldMappingBulkRowDto("s1", "t", null, null, null, null, null, null, "a", null, null);
        var row2 = new FieldMappingBulkRowDto("s2", "t", null, null, null, null, null, null, "a", null, null);

        AppException ex = assertThrows(AppException.class,
                () -> fieldMappingService.createBulk(new FieldMappingBulkCreateDto(1L, List.of(row1, row2))));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createBulkShouldSucceed() {
        var row = new FieldMappingBulkRowDto("s1", "t1", null, null, null, null, null, null, "", null, null);
        when(fieldMappingRepository.findByStepPkAndArrayTargetPathAndTargetPath(1L, "", "t1")).thenReturn(Optional.empty());
        when(fieldMappingRepository.saveAll(anyList())).thenAnswer(i -> i.getArgument(0));

        var out = fieldMappingService.createBulk(new FieldMappingBulkCreateDto(1L, List.of(row)));

        assertEquals(1, out.size());
        assertEquals("none", out.getFirst().transform_type());
    }

    @Test
    void updateShouldApplyFields() {
        FieldMapping existing = new FieldMapping();
        existing.setMappingPk(5L);
        existing.setStepPk(1L);
        when(fieldMappingRepository.findById(5L)).thenReturn(Optional.of(existing));
        when(fieldMappingRepository.save(any(FieldMapping.class))).thenAnswer(i -> i.getArgument(0));

        var out = fieldMappingService.update(5L, new FieldMappingUpdateDto("s", "t", "trim", "p", "d", true, 9, "as", "at", true, true));

        assertEquals("trim", out.transform_type());
        assertTrue(out.is_object_target());
    }

    @Test
    void listShouldUseStepFilter() {
        FieldMapping fm = new FieldMapping();
        fm.setMappingPk(1L);
        fm.setStepPk(1L);
        fm.setSourcePath("s");
        fm.setTargetPath("t");
        fm.setTransformType("none");
        fm.setIsRequired(false);
        fm.setSortOrder(0);
        fm.setArraySourcePath("");
        fm.setArrayTargetPath("");
        fm.setIsSingletonArray(false);
        fm.setIsObjectTarget(false);
        when(fieldMappingRepository.findByStepPkOrderByArrayTargetPathAscSortOrderAsc(1L)).thenReturn(List.of(fm));

        var out = fieldMappingService.list(1L, 0, 10);

        assertEquals(1, out.size());
    }

    @Test
    void listShouldUsePaginationWhenNoStepFilter() {
        FieldMapping fm = new FieldMapping();
        fm.setMappingPk(1L);
        fm.setStepPk(1L);
        fm.setSourcePath("s");
        fm.setTargetPath("t");
        fm.setTransformType("none");
        fm.setIsRequired(false);
        fm.setSortOrder(0);
        fm.setArraySourcePath("");
        fm.setArrayTargetPath("");
        fm.setIsSingletonArray(false);
        fm.setIsObjectTarget(false);
        when(fieldMappingRepository.findAll(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(fm)));

        var out = fieldMappingService.list(null, 0, 10);

        assertEquals(1, out.size());
    }

    @Test
    void createBulkShouldFailWhenAlreadyMappedInDb() {
        var row = new FieldMappingBulkRowDto("s1", "t1", null, null, null, null, null, null, "", null, null);
        when(fieldMappingRepository.findByStepPkAndArrayTargetPathAndTargetPath(1L, "", "t1")).thenReturn(Optional.of(new FieldMapping()));

        AppException ex = assertThrows(AppException.class,
                () -> fieldMappingService.createBulk(new FieldMappingBulkCreateDto(1L, List.of(row))));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void getShouldThrowWhenMissing() {
        when(fieldMappingRepository.findById(99L)).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> fieldMappingService.get(99L));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void deleteShouldRemoveMapping() {
        FieldMapping existing = new FieldMapping();
        existing.setMappingPk(5L);
        when(fieldMappingRepository.findById(5L)).thenReturn(Optional.of(existing));

        fieldMappingService.delete(5L);

        verify(fieldMappingRepository).delete(existing);
    }
}
